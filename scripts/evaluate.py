#!/usr/bin/env python3
"""
自动化回归评估框架
=================
读取测试用例 → 调用识别API → 对比期望值 → 计算指标 → 输出评估报告

用法:
    python scripts/evaluate.py                              # 运行全部测试用例
    python scripts/evaluate.py --filter-category "癌种识别"  # 按分类过滤
    python scripts/evaluate.py --filter-priority P0          # 按优先级过滤
    python scripts/evaluate.py --dry-run                     # 仅校验配置，不调用API
    python scripts/evaluate.py --concurrency 3               # 并发上传文件数

环境变量:
    API_BASE_URL   - API地址，默认 http://127.0.0.1:3000
    API_TOKEN      - x-api-token 认证令牌（与 API_EMAIL/API_PASSWORD 二选一）
    API_EMAIL      - 登录邮箱（需配合 API_PASSWORD）
    API_PASSWORD   - 登录密码
    SCHEMA_KEY     - 使用的Schema，默认 medical-record-core
    RESULTS_DIR    - 评估报告输出目录，默认 docs/evaluations
    JOB_TIMEOUT    - 单任务超时秒数，默认 300
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEST_CASES_PATH = PROJECT_ROOT / "docs" / "test-cases.json"
BASELINE_PATH = PROJECT_ROOT / "docs" / "baseline.json"
DEFAULT_SCHEMA_KEY = "general-medical-record"
DEFAULT_RESULTS_DIR = PROJECT_ROOT / "docs" / "evaluations"

# 字段优先级：与 schema-medical-record-core.json 对齐
FIELD_PRIORITY: dict[str, str] = {
    "patientName":           "required",
    "tumorType":             "required",
    "hospitalName":          "required",
    "patientGender":         "strong",
    "sampleType":            "strong",
    "detectionItems":        "strong",
    "reportDate":            "strong",
    "treatmentHistory":      "strong",
    "pathologicalDiagnosis": "strong",
    "clinicalStage":         "optional",
    "geneMutations":         "optional",
    "notes":                 "optional",
}


# ---------------------------------------------------------------------------
# 数据模型
# ---------------------------------------------------------------------------

@dataclass
class EvalConfig:
    api_base: str
    token: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    schema_key: str = DEFAULT_SCHEMA_KEY
    results_dir: Path = DEFAULT_RESULTS_DIR
    job_timeout: int = 300
    # 标记 job_timeout 是否由用户显式指定。False 时按图片数量动态计算超时（P2-6）。
    job_timeout_explicit: bool = False
    filter_category: Optional[str] = None
    filter_priority: Optional[str] = None
    concurrency: int = 3
    dry_run: bool = False


@dataclass
class FieldResult:
    field_key: str
    priority: str
    expected: Any
    actual: Any
    matched: bool
    is_missing: bool  # 期望有值但实际为空
    is_spurious: bool  # 实际有值但期望为空


@dataclass
class SampleResult:
    tc_id: str
    category: str
    test_focus: str
    priority: str
    files: list[str]
    job_id: Optional[str] = None
    job_status: Optional[str] = None
    error: Optional[str] = None
    field_results: list[FieldResult] = field(default_factory=list)
    latency_ms: float = 0.0


# ---------------------------------------------------------------------------
# HTTP 客户端（纯标准库，零外部依赖）
# ---------------------------------------------------------------------------

class ApiClient:
    """轻量 HTTP 客户端，仅依赖 urllib。"""

    def __init__(self, base_url: str, token: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _headers(self, extra: Optional[dict] = None) -> dict:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if extra:
            headers.update(extra)
        return headers

    def get(self, path: str, params: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        if params:
            qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
            if qs:
                url += f"?{qs}"
        req = Request(url, headers=self._headers(), method="GET")
        return self._send(req)

    def post(self, path: str, body: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(body or {}).encode("utf-8") if body is not None else None
        req = Request(
            url,
            data=data,
            headers=self._headers({"Content-Type": "application/json"}),
            method="POST",
        )
        return self._send(req)

    def _send(self, req: Request) -> dict:
        try:
            with urlopen(req, timeout=120) as resp:
                raw = resp.read()
                if not raw:
                    return {}
                return json.loads(raw)
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {e.code} {req.get_full_url()}: {body}") from e
        except URLError as e:
            raise RuntimeError(f"连接失败 {req.get_full_url()}: {e.reason}") from e


# ---------------------------------------------------------------------------
# 认证
# ---------------------------------------------------------------------------

def authenticate(client: ApiClient, config: EvalConfig) -> str:
    """返回可用的 token，优先使用 API_TOKEN，否则登录获取。"""
    if config.token:
        return config.token
    if not config.email or not config.password:
        raise RuntimeError("需要设置 API_TOKEN 或 API_EMAIL + API_PASSWORD 环境变量")
    resp = client.post("/auth/login", {"email": config.email, "password": config.password})
    token = resp.get("accessToken")
    if not token:
        raise RuntimeError(f"登录失败: {resp}")
    return token


# ---------------------------------------------------------------------------
# 测试用例与基线加载
# ---------------------------------------------------------------------------

def load_test_cases(path: Path) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_baseline(path: Path) -> dict:
    """加载基线数据，返回 {tc_id: {field_key: expected_value, ...}}。"""
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {item["tcId"]: item for item in data.get("samples", [])}


def filter_test_cases(
    cases: list[dict],
    category: Optional[str] = None,
    priority: Optional[str] = None,
) -> list[dict]:
    """过滤测试用例：排除 REF 类型（参考图片）。"""
    result = []
    for tc in cases:
        if tc.get("priority") == "REF":
            continue
        if category and tc.get("category") != category:
            continue
        if priority and tc.get("priority") != priority:
            continue
        result.append(tc)
    return result


# ---------------------------------------------------------------------------
# 文件上传 & 任务创建
# ---------------------------------------------------------------------------

def find_image_file(relative_path: str) -> Path:
    """在项目中查找图片文件。"""
    full = PROJECT_ROOT / relative_path
    if full.exists():
        return full
    # 尝试在固定测试集目录下查找
    alt = PROJECT_ROOT / "data" / relative_path
    if alt.exists():
        return alt
    raise FileNotFoundError(f"找不到文件: {relative_path}")


def upload_file(client: ApiClient, file_path: Path) -> str:
    """上传文件，返回 fileId。"""
    mime_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".bmp": "image/bmp",
        ".tiff": "image/tiff",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
    }
    suffix = file_path.suffix.lower()
    mime_type = mime_map.get(suffix, "application/octet-stream")
    content = file_path.read_bytes()
    body = {
        "originalName": file_path.name,
        "mimeType": mime_type,
        "byteSize": len(content),
        "contentBase64": base64.b64encode(content).decode("ascii"),
    }
    resp = client.post("/files", body)
    file_id = resp.get("id")
    if not file_id:
        raise RuntimeError(f"文件上传失败: {resp}")
    return file_id


def create_job(client: ApiClient, file_ids: list[str], schema_key: str) -> str:
    """创建识别任务，返回 jobId。"""
    body: dict[str, Any] = {"schemaKey": schema_key}
    if len(file_ids) == 1:
        body["sourceFileId"] = file_ids[0]
    else:
        body["sourceFileIds"] = file_ids
    resp = client.post("/jobs", body)
    job_id = resp.get("id")
    if not job_id:
        raise RuntimeError(f"任务创建失败: {resp}")
    return job_id


def wait_for_job(client: ApiClient, job_id: str, timeout: int) -> dict:
    """轮询任务直到完成或超时，返回任务详情。"""
    deadline = time.time() + timeout
    poll_interval = 3  # 初始轮询间隔
    while time.time() < deadline:
        resp = client.get(f"/jobs/{job_id}")
        status = resp.get("status", "")
        if status in ("completed", "partial_completed", "needs_review", "failed", "cancelled"):
            return resp
        if status == "error":
            return resp
        time.sleep(min(poll_interval, 10))
        poll_interval = min(poll_interval * 1.3, 10)
    raise TimeoutError(f"任务 {job_id} 超时（{timeout}s）")


def get_job_result(client: ApiClient, job_id: str) -> dict:
    """获取识别结果。"""
    try:
        return client.get(f"/results/{job_id}")
    except RuntimeError:
        # 有些任务失败时没有 result
        return {}


# ---------------------------------------------------------------------------
# 结果对比
# ---------------------------------------------------------------------------

def normalize_value(value: Any) -> Any:
    """归一化比较值：去除空白、统一小写。"""
    if value is None or value == "":
        return None
    if isinstance(value, str):
        return value.strip()
    return value


def fuzzy_match(expected: Any, actual: Any, field_key: str = "") -> bool:
    """模糊匹配：检查期望值是否被包含在实际值中（支持子串匹配）。

    对特定字段做交叉匹配增强：
    - tumorCategory：路径匹配，期望末级关键词在实际路径中即算匹配
    - clinicalStage：TNM 与临床分期两种格式交叉匹配
    """
    exp = normalize_value(expected)
    act = normalize_value(actual)

    # 处理 __ANY__ 特殊标记：期望有值，任意值都匹配
    if exp == "__ANY__":
        return act is not None

    if exp is None and act is None:
        return True
    if exp is None or act is None:
        return False
    if exp == act:
        return True
    # 字符串子串匹配
    if isinstance(exp, str) and isinstance(act, str):
        if exp in act or act in exp:
            return True
        # P1-4：tumorCategory 路径匹配 —— 期望末级关键词在实际路径中即算匹配
        if field_key in ("tumorCategory", "tumor_category"):
            if _path_keyword_match(exp, act):
                return True
        # P1-5：clinicalStage 交叉匹配 —— TNM 与临床分期两种格式
        if field_key in ("clinicalStage", "clinical_stage", "tumorStage", "tumor_stage"):
            if _stage_cross_match(exp, act):
                return True
    return False


def _path_keyword_match(expected: str, actual: str) -> bool:
    """P1-4：tumorCategory 路径匹配。
    期望值和实际值都是「系统/癌种/亚型」路径，只要末级（或任意一级）
    关键词在对方路径中出现即算匹配，忽略层级和命名差异。
    """
    exp_parts = [p.strip() for p in expected.split("/") if p.strip()]
    act_parts = [p.strip() for p in actual.split("/") if p.strip()]
    if not exp_parts or not act_parts:
        return False
    # 期望的任意一级在实际路径的任意一级中出现
    for ep in exp_parts:
        for ap in act_parts:
            if ep == ap or ep in ap or ap in ep:
                return True
    return False


# TNM 分期 → 临床分期粗略对照（用于交叉匹配）
_STAGE_TNM_TO_CLINICAL = {
    "T0": "0期", "Tis": "0期",
    "T1": "I期", "T2": "I期",
    "T3": "II期", "T4": "II期",
}
_CLINICAL_STAGE_PATTERN = re.compile(r"^([ⅠⅡⅢⅣⅤ一二三四五ivxIVX]{1,3})\s*期?$")


def _stage_cross_match(expected: str, actual: str) -> bool:
    """P1-5：clinicalStage 交叉匹配。
    支持 TNM 分期与临床分期（如 IV期）互相匹配。
    去除 yp/y 前缀后比较；临床分期按罗马数字对照。
    """
    def clean(s: str) -> str:
        # 去除新辅助治疗前后缀 y/yp
        s = re.sub(r"^y(?:p)?", "", s, flags=re.IGNORECASE)
        # TNM 主标记大写
        s = re.sub(r"([tnm])(?=\d|[xabc])", lambda m: m.group(1).upper(), s, flags=re.IGNORECASE)
        return s.strip()

    exp_c = clean(expected)
    act_c = clean(actual)
    if exp_c == act_c:
        return True

    # 提取临床分期罗马数字
    exp_clinical = _CLINICAL_STAGE_PATTERN.match(exp_c)
    act_clinical = _CLINICAL_STAGE_PATTERN.match(act_c)

    # 一方是临床分期，另一方含 TNM：按 T 分级粗略对照
    if exp_clinical or act_clinical:
        # 提取 TNM 中的 T 分级
        exp_t = re.match(r"^T(\d)", exp_c)
        act_t = re.match(r"^T(\d)", act_c)
        t_to_stage = {"1": "I期", "2": "I期", "3": "II期", "4": "II期"}
        if exp_clinical and act_t:
            if t_to_stage.get(act_t.group(1)) == exp_clinical.group(0):
                return True
        if act_clinical and exp_t:
            if t_to_stage.get(exp_t.group(1)) == act_clinical.group(0):
                return True

    return False



def compare_fields(
    expected_fields: list[str],
    expected_values: dict[str, Any],
    actual_result: dict[str, Any],
) -> list[FieldResult]:
    """对比期望字段与实际识别结果。"""
    results = []
    actual_fields = actual_result.get("fields", actual_result)

    # 构建字段值映射：支持数组格式 [{fieldKey, value}] 和字典格式 {key: value}
    field_value_map = {}
    if isinstance(actual_fields, list):
        # 数组格式：[{fieldKey: "xxx", value: "yyy"}, ...]
        for item in actual_fields:
            if isinstance(item, dict) and "fieldKey" in item:
                field_value_map[item["fieldKey"]] = item.get("value")
    elif isinstance(actual_fields, dict):
        # 字典格式：{key: value} 或 {key: {value: xxx}}
        for k, v in actual_fields.items():
            if isinstance(v, dict):
                field_value_map[k] = v.get("value", v.get("normalized"))
            else:
                field_value_map[k] = v

    for field_key in expected_fields:
        priority = FIELD_PRIORITY.get(field_key, "optional")
        expected_val = expected_values.get(field_key)

        # 从映射中取值
        actual_val = field_value_map.get(field_key)

        matched = fuzzy_match(expected_val, actual_val, field_key)
        is_missing = expected_val is not None and normalize_value(actual_val) is None
        is_spurious = expected_val is None and normalize_value(actual_val) is not None

        results.append(FieldResult(
            field_key=field_key,
            priority=priority,
            expected=expected_val,
            actual=actual_val,
            matched=matched,
            is_missing=is_missing,
            is_spurious=is_spurious,
        ))

    return results


# ---------------------------------------------------------------------------
# 指标计算
# ---------------------------------------------------------------------------

@dataclass
class MetricsSummary:
    """评估指标汇总。"""
    total_samples: int = 0
    completed_samples: int = 0
    failed_samples: int = 0
    # 字段级指标
    total_fields: int = 0
    matched_fields: int = 0
    missing_fields: int = 0
    spurious_fields: int = 0
    # 样本级完全正确率
    perfect_samples: int = 0

    @property
    def field_recall(self) -> Optional[float]:
        """字段级召回率 = 正确识别的字段 / 期望有值的字段。"""
        expected_with_value = self.total_fields - self.spurious_fields
        if expected_with_value == 0:
            return None
        return self.matched_fields / expected_with_value

    @property
    def field_precision(self) -> Optional[float]:
        """字段级精确率 = 正确识别的字段 / 实际识别的字段。"""
        actual_identified = self.matched_fields + self.spurious_fields
        if actual_identified == 0:
            return None
        return self.matched_fields / actual_identified

    @property
    def field_f1(self) -> Optional[float]:
        """字段级 F1 分数。"""
        r = self.field_recall
        p = self.field_precision
        if r is None or p is None or (r + p) == 0:
            return None
        return 2 * r * p / (r + p)

    @property
    def sample_perfect_rate(self) -> Optional[float]:
        """样本级完全正确率。"""
        if self.completed_samples == 0:
            return None
        return self.perfect_samples / self.completed_samples

    def to_dict(self) -> dict:
        return {
            "totalSamples": self.total_samples,
            "completedSamples": self.completed_samples,
            "failedSamples": self.failed_samples,
            "fieldMetrics": {
                "totalFields": self.total_fields,
                "matchedFields": self.matched_fields,
                "missingFields": self.missing_fields,
                "spuriousFields": self.spurious_fields,
                "recall": _pct(self.field_recall),
                "precision": _pct(self.field_precision),
                "f1": _pct(self.field_f1),
            },
            "sampleMetrics": {
                "perfectSamples": self.perfect_samples,
                "perfectRate": _pct(self.sample_perfect_rate),
            },
        }


def _pct(v: Optional[float]) -> str:
    if v is None:
        return "N/A"
    return f"{v * 100:.1f}%"


def compute_category_metrics(results: list[SampleResult]) -> dict[str, MetricsSummary]:
    """按 category 分组计算指标。"""
    groups: dict[str, list[SampleResult]] = defaultdict(list)
    for r in results:
        groups[r.category].append(r)
    return {cat: _compute_metrics(samples) for cat, samples in groups.items()}


def compute_field_metrics(results: list[SampleResult]) -> dict[str, dict]:
    """按字段维度计算指标。"""
    field_stats: dict[str, dict] = {}
    for r in results:
        for fr in r.field_results:
            if fr.field_key not in field_stats:
                field_stats[fr.field_key] = {
                    "fieldKey": fr.field_key,
                    "priority": fr.priority,
                    "total": 0, "matched": 0, "missing": 0, "spurious": 0,
                }
            s = field_stats[fr.field_key]
            s["total"] += 1
            if fr.matched:
                s["matched"] += 1
            if fr.is_missing:
                s["missing"] += 1
            if fr.is_spurious:
                s["spurious"] += 1

    for s in field_stats.values():
        total = s["total"]
        s["accuracy"] = f"{s['matched'] / total * 100:.1f}%" if total else None

    return field_stats


def _compute_metrics(results: list[SampleResult]) -> MetricsSummary:
    m = MetricsSummary()
    m.total_samples = len(results)
    for r in results:
        if r.error:
            m.failed_samples += 1
            continue
        m.completed_samples += 1
        all_matched = True
        for fr in r.field_results:
            m.total_fields += 1
            if fr.matched:
                m.matched_fields += 1
            if fr.is_missing:
                m.missing_fields += 1
            if fr.is_spurious:
                m.spurious_fields += 1
            if not fr.matched:
                all_matched = False
        if all_matched and len(r.field_results) > 0:
            m.perfect_samples += 1
    return m


# ---------------------------------------------------------------------------
# 评估报告生成
# ---------------------------------------------------------------------------

def build_report(
    config: EvalConfig,
    results: list[SampleResult],
    start_time: float,
    end_time: float,
) -> dict:
    """构建完整的 JSON 评估报告。"""
    overall = _compute_metrics(results)
    by_category = compute_category_metrics(results)
    by_field = compute_field_metrics(results)

    # 失败用例详情
    failures = []
    for r in results:
        if r.error:
            failures.append({
                "tcId": r.tc_id,
                "category": r.category,
                "error": r.error,
            })
        else:
            wrong_fields = [asdict(fr) for fr in r.field_results if not fr.matched]
            if wrong_fields:
                failures.append({
                    "tcId": r.tc_id,
                    "category": r.category,
                    "testFocus": r.test_focus,
                    "jobId": r.job_id,
                    "wrongFields": wrong_fields,
                })

    report = {
        "reportMeta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "durationSeconds": round(end_time - start_time, 1),
            "apiBase": config.api_base,
            "schemaKey": config.schema_key,
            "filter": {
                "category": config.filter_category,
                "priority": config.filter_priority,
            },
        },
        "overall": overall.to_dict(),
        "byCategory": {
            cat: m.to_dict() for cat, m in by_category.items()
        },
        "byField": by_field,
        "failures": failures,
        "samples": [
            {
                "tcId": r.tc_id,
                "category": r.category,
                "priority": r.priority,
                "jobId": r.job_id,
                "status": r.job_status,
                "error": r.error,
                "latencyMs": round(r.latency_ms, 0),
                "fields": [asdict(fr) for fr in r.field_results],
            }
            for r in results
        ],
    }

    # 优化建议
    report["recommendations"] = generate_recommendations(report)

    return report


def _parse_pct(v: Optional[str]) -> Optional[float]:
    """将百分比字符串转为浮点数，'N/A' 或 None 返回 None。"""
    if not v or v == "N/A":
        return None
    return float(v.rstrip("%"))


def generate_recommendations(report: dict) -> list[str]:
    """根据评估结果自动生成优化建议。"""
    recs = []
    overall = report.get("overall", {})
    field_metrics = overall.get("fieldMetrics", {})
    sample_metrics = overall.get("sampleMetrics", {})

    # 召回率偏低
    recall = _parse_pct(field_metrics.get("recall"))
    if recall is not None and recall < 80:
        recs.append("字段召回率低于80%，建议检查OCR质量和Schema字段定义的提取指引。")

    # 精确率偏低
    precision = _parse_pct(field_metrics.get("precision"))
    if precision is not None and precision < 80:
        recs.append("字段精确率低于80%，存在较多误识别，建议增强Schema中的反例指导。")

    # 完全正确率偏低
    perfect_rate = _parse_pct(sample_metrics.get("perfectRate"))
    if perfect_rate is not None and perfect_rate < 50:
        recs.append("样本完全正确率低于50%，建议针对高频错误字段进行专项优化。")

    # 按分类查找弱项
    by_cat = report.get("byCategory", {})
    weak_categories = []
    for cat, m in by_cat.items():
        cat_perfect = _parse_pct(m.get("sampleMetrics", {}).get("perfectRate"))
        if cat_perfect is not None and cat_perfect < 40:
            weak_categories.append(cat)
    if weak_categories:
        recs.append(f"以下测试方向完全正确率极低（<40%），需重点关注：{', '.join(weak_categories)}")

    # 按字段查找弱项
    by_field = report.get("byField", {})
    weak_fields = []
    for fk, s in by_field.items():
        acc = _parse_pct(s.get("accuracy"))
        if acc is not None and acc < 60:
            weak_fields.append(f"{fk}({s['priority']})")
    if weak_fields:
        recs.append(f"以下字段准确率低于60%：{', '.join(weak_fields)}，建议优化提取逻辑或补充知识库。")

    if not recs:
        recs.append("各项指标表现良好，建议持续回归监控。")

    return recs


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def run_evaluation(config: EvalConfig) -> dict:
    """执行完整评估流程。"""
    # 加载测试用例和基线
    test_cases = load_test_cases(TEST_CASES_PATH)
    baseline = load_baseline(BASELINE_PATH)
    test_cases = filter_test_cases(test_cases, config.filter_category, config.filter_priority)

    print(f"📋 加载 {len(test_cases)} 个测试用例（已排除 REF 参考图片）")
    if baseline:
        print(f"📊 加载 {len(baseline)} 条基线数据")

    if not test_cases:
        print("⚠️  没有匹配的测试用例")
        return {}

    # 初始化 API 客户端
    client = ApiClient(config.api_base)
    if not config.dry_run:
        token = authenticate(client, config)
        client.token = token
        print(f"✅ 认证成功")

    results: list[SampleResult] = []
    start_time = time.time()

    for idx, tc in enumerate(test_cases, 1):
        tc_id = tc["id"]
        category = tc.get("category", "")
        test_focus = tc.get("testFocus", "")
        priority = tc.get("priority", "P1")
        files = tc.get("files", [])
        expected_fields = tc.get("expectedFields", [])
        baseline_entry = baseline.get(tc_id, {})
        expected_values = baseline_entry.get("expectedValues", {})

        print(f"\n[{idx}/{len(test_cases)}] {tc_id} - {test_focus}")

        if config.dry_run:
            print(f"  🏃 dry-run: 跳过API调用")
            results.append(SampleResult(
                tc_id=tc_id, category=category, test_focus=test_focus,
                priority=priority, files=files,
            ))
            continue

        sr = SampleResult(
            tc_id=tc_id, category=category, test_focus=test_focus,
            priority=priority, files=files,
        )

        try:
            # 1. 上传文件
            file_ids = []
            for fp in files:
                full_path = find_image_file(fp)
                fid = upload_file(client, full_path)
                file_ids.append(fid)
                print(f"  📤 已上传: {Path(fp).name} → {fid[:8]}...")

            # 2. 创建任务
            job_id = create_job(client, file_ids, config.schema_key)
            sr.job_id = job_id
            print(f"  🔧 任务已创建: {job_id[:8]}...")

            # 3. 等待完成
            # P2-6：按图片数量动态调整超时。用户未显式指定 --timeout 时，
            # 用 max(180, file_count * 90) 秒；显式指定则用固定值。
            file_count = len(file_ids)
            if config.job_timeout_explicit:
                effective_timeout = config.job_timeout
            else:
                effective_timeout = max(180, file_count * 90)
            t0 = time.time()
            job_detail = wait_for_job(client, job_id, effective_timeout)
            sr.latency_ms = (time.time() - t0) * 1000
            sr.job_status = job_detail.get("status", "unknown")

            if sr.job_status not in ("completed", "partial_completed", "needs_review"):
                sr.error = f"任务状态: {sr.job_status}"
                print(f"  ❌ {sr.error}")
                results.append(sr)
                continue

            # 4. 获取结果
            actual_result = get_job_result(client, job_id)

            # 5. 对比
            sr.field_results = compare_fields(expected_fields, expected_values, actual_result)

            matched = sum(1 for fr in sr.field_results if fr.matched)
            total = len(sr.field_results)
            print(f"  ✅ 完成: {matched}/{total} 字段匹配, 耗时 {sr.latency_ms:.0f}ms")

        except Exception as e:
            sr.error = str(e)
            print(f"  ❌ 异常: {e}")

        results.append(sr)

    end_time = time.time()

    # 生成报告
    report = build_report(config, results, start_time, end_time)

    # 输出报告
    config.results_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = config.results_dir / f"evaluation_{timestamp}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    # 同时输出最新报告链接
    latest_path = config.results_dir / "latest.json"
    with open(latest_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    # 打印摘要
    print_summary(report, report_path)

    return report


def print_summary(report: dict, report_path: Path):
    """打印评估摘要。"""
    overall = report.get("overall", {})
    fm = overall.get("fieldMetrics", {})
    sm = overall.get("sampleMetrics", {})

    print("\n" + "=" * 60)
    print("📊 评估报告摘要")
    print("=" * 60)
    print(f"总样本数:       {overall.get('totalSamples', 0)}")
    print(f"完成样本:       {overall.get('completedSamples', 0)}")
    print(f"失败样本:       {overall.get('failedSamples', 0)}")
    print(f"字段召回率:     {fm.get('recall', 'N/A')}")
    print(f"字段精确率:     {fm.get('precision', 'N/A')}")
    print(f"字段F1:         {fm.get('f1', 'N/A')}")
    print(f"完全正确样本:   {sm.get('perfectSamples', 0)}")
    print(f"完全正确率:     {sm.get('perfectRate', 'N/A')}")
    print(f"\n📁 报告已保存: {report_path}")

    # 分类摘要
    by_cat = report.get("byCategory", {})
    if by_cat:
        print(f"\n{'分类':<16} {'召回率':>8} {'精确率':>8} {'完全正确率':>10}")
        print("-" * 46)
        for cat, m in by_cat.items():
            cfm = m.get("fieldMetrics", {})
            csm = m.get("sampleMetrics", {})
            print(f"{cat:<16} {cfm.get('recall', 'N/A'):>8} {cfm.get('precision', 'N/A'):>8} {csm.get('perfectRate', 'N/A'):>10}")

    # 优化建议
    recs = report.get("recommendations", [])
    if recs:
        print("\n💡 优化建议:")
        for r in recs:
            print(f"  - {r}")


# ---------------------------------------------------------------------------
# CLI 入口
# ---------------------------------------------------------------------------

def main():
    # P2-7：启用行缓冲，确保 nohup/重定向输出时实时可见进度，不被块缓冲吞掉。
    # 用户也可用 PYTHONUNBUFFERED=1 环境变量达到同样效果。
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except AttributeError:
        # 某些环境（如重定向的 stream）不支持 reconfigure，忽略即可
        pass

    parser = argparse.ArgumentParser(
        description="医疗记录识别 - 自动化回归评估",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--filter-category", help="按测试分类过滤（如 '癌种识别'）")
    parser.add_argument("--filter-priority", help="按优先级过滤（如 P0）")
    parser.add_argument("--concurrency", type=int, default=3, help="并发数（默认3）")
    parser.add_argument("--dry-run", action="store_true", help="仅校验配置，不调用API")
    parser.add_argument("--timeout", type=int, default=None, help="单任务超时秒数（未指定时按图片数量动态计算，每图90s下限180s）")
    parser.add_argument("--api-base", default=None, help="API地址")
    parser.add_argument("--schema-key", default=None, help="Schema Key")
    parser.add_argument("--output-dir", default=None, help="报告输出目录")
    args = parser.parse_args()

    # P2-6：--timeout 或 JOB_TIMEOUT 显式指定时用固定值，否则按图片数量动态计算
    env_timeout = os.getenv("JOB_TIMEOUT")
    explicit_timeout = args.timeout if args.timeout is not None else (
        int(env_timeout) if env_timeout else None
    )

    config = EvalConfig(
        api_base=args.api_base or os.getenv("API_BASE_URL", "http://127.0.0.1:3000"),
        token=os.getenv("API_TOKEN"),
        email=os.getenv("API_EMAIL"),
        password=os.getenv("API_PASSWORD"),
        schema_key=args.schema_key or os.getenv("SCHEMA_KEY", DEFAULT_SCHEMA_KEY),
        results_dir=Path(args.output_dir) if args.output_dir else Path(
            os.getenv("RESULTS_DIR", str(DEFAULT_RESULTS_DIR))
        ),
        job_timeout=explicit_timeout if explicit_timeout is not None else 300,
        job_timeout_explicit=explicit_timeout is not None,
        filter_category=args.filter_category,
        filter_priority=args.filter_priority,
        concurrency=args.concurrency,
        dry_run=args.dry_run,
    )

    try:
        run_evaluation(config)
    except KeyboardInterrupt:
        print("\n⚠️  评估被用户中断")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ 评估失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
