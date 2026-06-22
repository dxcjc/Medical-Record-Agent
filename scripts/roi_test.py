#!/usr/bin/env python3
"""
ROI 量化测试脚本 — 分阶段测量各 workflow 阶段的投入产出比。

三种模式(通过 --mode 控制,对应任务3的 providerConfig 覆盖):
  - extract_only:  单次提取(extractionMode=single, 关视觉+关重试) — 1 次 LLM 调用
  - extract_visual: 提取+视觉(关重试, 开视觉) — 2 次 LLM 调用
  - full:          完整流程(supervisor 自动决策) — 默认行为

每模式跑同一批样本,输出:完成数、平均耗时、各字段准确率、超时数。
对比三模式数据量化各阶段 ROI,决定取舍。

用法:
  python scripts/roi_test.py --mode extract_only --filter-priority P0
  python scripts/roi_test.py --mode extract_visual --filter-priority P0
  python scripts/roi_test.py --mode full --filter-priority P0

环境变量(同 evaluate.py):
  API_BASE_URL / API_TOKEN / API_EMAIL / API_PASSWORD / JOB_TIMEOUT
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

# 复用 evaluate.py 的核心逻辑
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from evaluate import (  # noqa: E402
    ApiClient,
    EvalConfig,
    authenticate,
    compare_fields,
    create_job,
    filter_test_cases,
    find_image_file,
    get_job_result,
    load_baseline,
    load_test_cases,
    upload_file,
    wait_for_job,
    BASELINE_PATH,
    TEST_CASES_PATH,
)


# 三种模式对应的 providerConfig 覆盖
MODE_CONFIGS = {
    # 单次提取:关视觉 + 关重试,1 次 LLM 调用
    "extract_only": {
        "extractionMode": "single",
        "enableVisualReview": False,
        "maxRetryRounds": 0,
    },
    # 提取+视觉:开视觉 + 关重试,2 次 LLM 调用
    "extract_visual": {
        "extractionMode": "multiSource",
        "enableVisualReview": True,
        "maxRetryRounds": 0,
    },
    # 完整流程:不覆盖,由 supervisor 自动决策
    "full": None,
}


@dataclass
class RoiSampleResult:
    tc_id: str
    status: str = "pending"  # ok / timeout / failed
    elapsed: float = 0.0
    correct: int = 0
    total: int = 0
    accuracy: float = 0.0
    field_details: dict = field(default_factory=dict)
    error: str = ""


@dataclass
class RoiReport:
    mode: str
    total: int = 0
    completed: int = 0
    timed_out: int = 0
    failed: int = 0
    avg_elapsed: float = 0.0
    avg_accuracy: float = 0.0
    field_stats: dict = field(default_factory=dict)
    samples: list = field(default_factory=list)


def run_one_sample(
    client: ApiClient,
    tc: dict,
    baseline: dict,
    schema_key: str,
    provider_config: Optional[dict],
    timeout: int,
) -> RoiSampleResult:
    """跑单个样本,返回结果。"""
    tc_id = tc.get("id", "unknown")
    sr = RoiSampleResult(tc_id=tc_id)
    files = tc.get("files", [])
    if not files:
        sr.status = "failed"
        sr.error = "无文件"
        return sr

    expected_fields = tc.get("expectedFields", [])
    expected_values = baseline.get(tc_id, {}).get("expectedValues", {})

    try:
        # 上传文件
        file_ids = []
        for fp in files:
            full = find_image_file(fp)
            if not full:
                sr.status = "failed"
                sr.error = f"文件未找到: {fp}"
                return sr
            file_ids.append(upload_file(client, full))

        # 创建任务
        job_id = create_job(client, file_ids, schema_key, provider_config)

        # 等待完成(动态超时)
        effective_timeout = max(180, len(file_ids) * 90) if timeout == 0 else timeout
        t0 = time.time()
        job_detail = wait_for_job(client, job_id, effective_timeout)
        sr.elapsed = round(time.time() - t0, 1)

        # 解析结果
        status = job_detail.get("status", "")
        if status in ("completed", "partial_completed", "needs_review", "writeback_completed"):
            sr.status = "ok"
            actual_result = get_job_result(client, job_id)
            field_results = compare_fields(expected_fields, expected_values, actual_result)
            sr.total = len(field_results)
            sr.correct = sum(1 for fr in field_results if fr.matched)
            sr.accuracy = round(sr.correct / sr.total * 100, 1) if sr.total > 0 else 0.0
            # 字段级明细
            sr.field_details = {
                fr.field_key: {"match": fr.matched, "expected": fr.expected, "actual": fr.actual}
                for fr in field_results
            }
        else:
            sr.status = "failed"
            sr.error = f"任务状态: {status}"

    except TimeoutError as e:
        sr.status = "timeout"
        sr.error = str(e)
    except Exception as e:
        sr.status = "failed"
        sr.error = str(e)

    return sr


def run_mode(
    mode: str,
    test_cases: list,
    baseline: dict,
    config: EvalConfig,
    timeout: int,
) -> RoiReport:
    """跑指定模式的全部样本。"""
    provider_config = MODE_CONFIGS[mode]
    report = RoiReport(mode=mode, total=len(test_cases))

    client = ApiClient(config.api_base)
    token = authenticate(client, config)
    client.token = token

    print(f"\n{'='*60}")
    print(f"  ROI 模式: {mode}  (providerConfig: {provider_config})")
    print(f"  样本数: {len(test_cases)}  超时: {timeout}s")
    print(f"{'='*60}")

    for i, tc in enumerate(test_cases, 1):
        tc_id = tc.get("id", f"TC{i}")
        print(f"\n[{i}/{len(test_cases)}] {tc_id} ...", end="", flush=True)
        sr = run_one_sample(client, tc, baseline, config.schema_key, provider_config, timeout)
        report.samples.append(sr)

        if sr.status == "ok":
            report.completed += 1
            print(f" ✅ {sr.accuracy}% ({sr.correct}/{sr.total}) {sr.elapsed}s")
        elif sr.status == "timeout":
            report.timed_out += 1
            print(f" ⏰ 超时 {sr.elapsed}s")
        else:
            report.failed += 1
            print(f" ❌ {sr.error}")

    # 汇总
    ok_samples = [s for s in report.samples if s.status == "ok"]
    if ok_samples:
        report.avg_elapsed = round(sum(s.elapsed for s in ok_samples) / len(ok_samples), 1)
        report.avg_accuracy = round(sum(s.accuracy for s in ok_samples) / len(ok_samples), 1)
        # 字段级统计
        field_correct: dict[str, int] = {}
        field_total: dict[str, int] = {}
        for s in ok_samples:
            for fk, fd in s.field_details.items():
                field_total[fk] = field_total.get(fk, 0) + 1
                if fd.get("match"):
                    field_correct[fk] = field_correct.get(fk, 0) + 1
        report.field_stats = {
            fk: {
                "correct": field_correct.get(fk, 0),
                "total": field_total[fk],
                "accuracy": round(field_correct.get(fk, 0) / field_total[fk] * 100, 1),
            }
            for fk in field_total
        }

    return report


def print_comparison(reports: list[RoiReport]) -> None:
    """打印多模式对比表。"""
    print(f"\n{'='*70}")
    print("  ROI 对比汇总")
    print(f"{'='*70}")
    header = f"{'模式':<18}{'完成':<8}{'超时':<8}{'失败':<8}{'平均耗时':<12}{'平均准确率':<12}"
    print(header)
    print("-" * 70)
    for r in reports:
        print(
            f"{r.mode:<18}{r.completed:<8}{r.timed_out:<8}{r.failed:<8}"
            f"{r.avg_elapsed}s{'':<6}{r.avg_accuracy}%"
        )
    print(f"{'='*70}")

    # 字段级准确率对比
    all_fields = set()
    for r in reports:
        all_fields.update(r.field_stats.keys())
    if all_fields:
        print("\n字段级准确率对比:")
        print(f"{'字段':<25}", end="")
        for r in reports:
            print(f"{r.mode:<16}", end="")
        print()
        print("-" * (25 + 16 * len(reports)))
        for fk in sorted(all_fields):
            print(f"{fk:<25}", end="")
            for r in reports:
                fs = r.field_stats.get(fk)
                if fs:
                    print(f"{fs['accuracy']}%({fs['correct']}/{fs['total']})".ljust(16), end="")
                else:
                    print("-".ljust(16), end="")
            print()


def main():
    # 启用行缓冲
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except AttributeError:
        pass

    parser = argparse.ArgumentParser(description="ROI 量化测试 — 分阶段测量 workflow 各阶段投入产出比")
    parser.add_argument(
        "--mode",
        choices=["extract_only", "extract_visual", "full", "all"],
        default="all",
        help="测试模式(默认 all 跑全部三种对比)",
    )
    parser.add_argument("--filter-priority", default="P0", help="按优先级过滤(默认 P0)")
    parser.add_argument("--filter-category", default=None, help="按类别过滤")
    parser.add_argument("--timeout", type=int, default=0, help="单任务超时秒数(0=动态计算)")
    parser.add_argument("--output", default=None, help="结果输出 JSON 路径")
    args = parser.parse_args()

    # 加载配置
    env_timeout = os.getenv("JOB_TIMEOUT")
    explicit_timeout = args.timeout if args.timeout > 0 else (
        int(env_timeout) if env_timeout else None
    )
    job_timeout = explicit_timeout if explicit_timeout is not None else 300

    config = EvalConfig(
        api_base=os.getenv("API_BASE_URL", "http://127.0.0.1:3000"),
        token=os.getenv("API_TOKEN"),
        email=os.getenv("API_EMAIL"),
        password=os.getenv("API_PASSWORD"),
        schema_key=os.getenv("SCHEMA_KEY", "medical-record-core"),
        job_timeout=job_timeout,
    )

    # 加载测试用例和基线
    test_cases = load_test_cases(TEST_CASES_PATH)
    baseline = load_baseline(BASELINE_PATH)
    test_cases = filter_test_cases(test_cases, args.filter_category, args.filter_priority)

    if not test_cases:
        print("没有匹配的测试用例")
        return

    print(f"加载 {len(test_cases)} 个测试用例 (优先级: {args.filter_priority})")

    # 确定要跑的模式
    modes = ["extract_only", "extract_visual", "full"] if args.mode == "all" else [args.mode]

    # 逐模式跑
    reports: list[RoiReport] = []
    for mode in modes:
        report = run_mode(mode, test_cases, baseline, config, job_timeout)
        reports.append(report)
        print(f"\n[{mode}] 完成 {report.completed}/{report.total}, 平均 {report.avg_elapsed}s, 准确率 {report.avg_accuracy}%")

    # 对比汇总
    if len(reports) > 1:
        print_comparison(reports)

    # 输出 JSON
    output_path = args.output or str(PROJECT_ROOT / "docs" / "evaluations" / f"roi_{int(time.time())}.json")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    output_data = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "filter": {"priority": args.filter_priority, "category": args.filter_category},
        "timeout": job_timeout,
        "reports": [
            {
                "mode": r.mode,
                "total": r.total,
                "completed": r.completed,
                "timed_out": r.timed_out,
                "failed": r.failed,
                "avg_elapsed": r.avg_elapsed,
                "avg_accuracy": r.avg_accuracy,
                "field_stats": r.field_stats,
            }
            for r in reports
        ],
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print(f"\n结果已保存: {output_path}")


if __name__ == "__main__":
    main()
