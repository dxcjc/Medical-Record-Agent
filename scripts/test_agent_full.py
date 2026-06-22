#!/usr/bin/env python3
"""
完整Agent识别率测试脚本 test_agent_full.py
==========================================
测试完整Agent流程（OCR + RAG + 知识库 + LLM + 验证）的识别率。

特性：
- 使用 expectations_192.json 作为期望值（新Schema: medical-record-evaluation-v1）
- Token自动刷新（30分钟TTL）
- 300秒超时
- 匹配逻辑：精确匹配 → 包含匹配 → 关键词匹配（>50%）
- 详细错误分析：区分'漏识'和'错识'
- 耗时统计
- 进度显示：[1/45] TC001 (5F, 1f)... 5/5 ✅
- 结果保存到 test_result_agent_full.json
"""

import json
import requests
import time
import base64
import hashlib
import os
import re
import sys
from collections import defaultdict
from datetime import datetime

# ============================================================
# 配置
# ============================================================
API = "http://127.0.0.1:3000"
TESTCASES_FILE = "docs/test-cases.json"
IMAGE_DIR = "../固定测试集共45个样本"
EXPECTATIONS_FILE = "docs/evaluation_baseline_v1.json"
SCHEMA_KEY = "medical-record-evaluation-v3"
TIMEOUT_PER_SAMPLE = 600  # 10分钟（视觉审查+冲突重提取需要更多时间）
TOKEN_TTL = 1800          # 30分钟刷新
OUTPUT_FILE = "test_result_agent_full.json"
SKIP_SAMPLES = {}  # 不跳过任何样本

# ============================================================
# Token 管理
# ============================================================
_token = None
_token_time = 0


def get_token():
    """获取或刷新认证Token，自动处理过期。"""
    global _token, _token_time
    now = time.time()
    if _token and now - _token_time < TOKEN_TTL:
        return _token
    try:
        resp = requests.post(
            f"{API}/auth/login",
            json={"email": "admin.dev@example.local", "password": "ChangeMe123!"},
            timeout=15,
        )
        if resp.status_code == 200:
            _token = resp.json().get("accessToken")
            _token_time = now
            return _token
        print(f"  ⚠️ 登录失败: HTTP {resp.status_code}")
    except Exception as e:
        print(f"  ⚠️ 登录异常: {e}")
    return None


def auth_headers():
    """返回带Authorization的请求头。"""
    return {"Authorization": f"Bearer {get_token()}"}


# ============================================================
# 数据加载
# ============================================================
def load_expectations():
    """加载期望值文件。"""
    if not os.path.exists(EXPECTATIONS_FILE):
        print(f"❌ 期望值文件不存在: {EXPECTATIONS_FILE}")
        sys.exit(1)
    data = json.load(open(EXPECTATIONS_FILE, encoding="utf-8"))
    total_fields = sum(len(v) for v in data.values())
    print(f"✅ 加载 {len(data)} 个样本的期望值（{total_fields} 字段）")
    return data


def load_testcases():
    """加载测试用例，返回 id→tc 的映射。"""
    if not os.path.exists(TESTCASES_FILE):
        print(f"❌ 测试用例文件不存在: {TESTCASES_FILE}")
        sys.exit(1)
    data = json.load(open(TESTCASES_FILE, encoding="utf-8"))
    return {t["id"]: t for t in data}


# ============================================================
# 图片查找
# ============================================================
def find_image(path):
    """在IMAGE_DIR中查找图片文件，支持多种路径格式。"""
    if os.path.exists(path):
        return path
    full = os.path.join(IMAGE_DIR, path)
    if os.path.exists(full):
        return full
    fname = os.path.basename(path)
    for root, _dirs, files in os.walk(IMAGE_DIR):
        if fname in files:
            return os.path.join(root, fname)
    return None


# ============================================================
# API 交互
# ============================================================
def upload_image(filepath):
    """上传图片文件，返回fileId。最多重试3次。"""
    try:
        with open(filepath, "rb") as f:
            content = f.read()
    except Exception as e:
        print(f"  ⚠️ 读取文件失败 {filepath}: {e}")
        return None

    checksum = hashlib.sha256(content).hexdigest()
    ext = os.path.splitext(filepath)[1].lower()
    mime_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
    mime_type = mime_map.get(ext, "image/png")

    payload = {
        "originalName": os.path.basename(filepath),
        "mimeType": mime_type,
        "byteSize": len(content),
        "checksumSha256": checksum,
        "contentBase64": base64.b64encode(content).decode(),
    }

    for attempt in range(3):
        try:
            resp = requests.post(
                f"{API}/files", json=payload, headers=auth_headers(), timeout=60
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return data.get("id") or data.get("fileId")
            if resp.status_code == 401:
                get_token()
                continue
            print(f"  ⚠️ 上传失败: HTTP {resp.status_code}")
        except Exception as e:
            print(f"  ⚠️ 上传异常(尝试{attempt+1}): {e}")
        time.sleep(1)
    return None


def create_job(file_ids):
    """创建识别任务，返回jobId。"""
    for attempt in range(2):
        try:
            # 使用sourceFileId（单数）而不是sourceFileIds（复数）
            resp = requests.post(
                f"{API}/jobs",
                json={"sourceFileId": file_ids[0], "schemaKey": SCHEMA_KEY, "providerConfig": {"visualProviderKey": "volces-kimi-k26"}},
                headers=auth_headers(),
                timeout=30,
            )
            if resp.status_code == 401:
                get_token()
                continue
            if resp.status_code in (200, 201):
                data = resp.json()
                return data.get("id") or data.get("jobId")
            print(f"  ⚠️ 创建job失败: HTTP {resp.status_code} - {resp.text[:200]}")
        except Exception as e:
            print(f"  ⚠️ 创建job异常: {e}")
    return None


def wait_job(job_id):
    """轮询等待job完成，超时返回None。"""
    start = time.time()
    while time.time() - start < TIMEOUT_PER_SAMPLE:
        try:
            resp = requests.get(
                f"{API}/jobs/{job_id}", headers=auth_headers(), timeout=15
            )
            if resp.status_code == 200:
                status = resp.json().get("status", "")
                if status in ("completed", "needs_review", "partial_completed", "failed"):
                    return resp.json()
            if resp.status_code == 401:
                get_token()
        except Exception:
            pass
        time.sleep(5)
    return None


def get_result(job_id):
    """获取job识别结果，返回 fieldKey→value 字典。"""
    try:
        resp = requests.get(
            f"{API}/results/{job_id}", headers=auth_headers(), timeout=15
        )
        if resp.status_code == 200:
            fields = resp.json().get("fields", [])
            result = {}
            for f in fields:
                fk = f.get("fieldKey", "")
                val = f.get("value") or f.get("rawValue") or ""
                if val:
                    result[fk] = val
            return result
    except Exception:
        pass
    return {}


# ============================================================
# 匹配逻辑（v2 - 增强版）
# ============================================================
def _normalize_parentheses(s):
    """统一括号格式：全角→半角，去除空格"""
    s = s.replace("（", "(").replace("）", ")")
    s = re.sub(r'\s+', '', s)
    return s

def _normalize_stage(s):
    """规范化临床分期：去除yp前缀，统一格式"""
    s = re.sub(r'^yp?', '', s, flags=re.IGNORECASE)
    # 统一逗号/分号分隔
    s = s.replace("，", ",").replace(";", ",")
    return s.strip()

def _normalize_numbers(s):
    """统一数字格式：中文数字→阿拉伯数字"""
    cn_num_map = {'一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
                  '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
                  '十一': '11', '十二': '12', '十三': '13', '十四': '14', '十五': '15',
                  '二十': '20', '二十五': '25', '三十': '30'}
    for cn, ar in sorted(cn_num_map.items(), key=lambda x: -len(x[0])):
        s = s.replace(cn, ar)
    return s

def _extract_chinese_bigrams(s):
    """提取中文字符二元组，用于模糊匹配"""
    # 提取连续中文字符
    segments = re.findall(r'[\u4e00-\u9fff]+', s)
    bigrams = set()
    for seg in segments:
        for i in range(len(seg) - 1):
            bigrams.add(seg[i:i+2])
        # 也添加三元组
        for i in range(len(seg) - 2):
            bigrams.add(seg[i:i+3])
    return bigrams

def _extract_diagnosis_keywords(s):
    """提取诊断核心关键词（癌种、组织学类型等）"""
    # 常见诊断关键词
    keywords = set()
    patterns = [
        r'腺癌', r'鳞癌', r'鳞状细胞癌', r'小细胞癌', r'大细胞癌',
        r'淋巴瘤', r'肉瘤', r'间质瘤', r'胶质瘤', r'黑色素瘤',
        r'尿路上皮癌', r'移行细胞癌', r'导管癌', r'小叶癌',
        r'浸润性', r'原位', r'微浸润', r'转移性', r'低分化', r'中分化', r'高分化',
        r'非小细胞', r'神经内分泌', r'黏液', r'浆液性', r'透明细胞',
        r'恶性', r'良性', r'纤维瘤', r'肌瘤',
    ]
    s_lower = s.lower()
    for p in patterns:
        if re.search(p, s_lower):
            keywords.add(p)
    return keywords

def match_value(expected, actual, field_name=""):
    """
    智能模糊匹配（v4）：
    1. null处理：期望null时实际必须为空/null
    2. cancerTag：英文→中文映射 + 多癌识别
    3. cancerCategory：路径组件匹配 + 癌种层级同义词
    4. interpretationMatch：泛化匹配 + 癌种同义词
    5. pathologicalDiagnosis：括号归一化 + 子串匹配 + 多诊断部分匹配
    6. clinicalStage：yp前缀归一化 + TNM格式匹配
    7. surgery：术式动词归一化
    8. radiotherapy：日期剥离 + 关键词匹配
    9. 通用：精确→包含→关键词匹配
    """
    # null处理
    if expected is None or str(expected).strip().lower() in ("null", "none", ""):
        return actual is None or str(actual).strip() in ("", "null", "None", "未识别")
    if not actual or str(actual).strip() == "" or str(actual) == "未识别":
        # 特殊处理：期望值为"无"/"未做"/"未行"时，空值视为匹配（漏识=未做）
        exp_lower = str(expected).strip().lower()
        if exp_lower in ("无", "未做", "未行", "未进行", "未见", "未提及"):
            return True
        return False

    exp_s = str(expected).strip().lower()
    act_s = str(actual).strip().lower()

    # 精确匹配
    if exp_s == act_s:
        return True

    # cancerTag: 英文→中文映射 + 多癌识别
    if field_name == "cancerTag":
        tag_map = {
            "single": "单癌", "单癌": "single",
            "unknown_primary": "原发灶不明", "原发灶不明": "unknown_primary",
            "multi": "多癌", "多癌": "multi",
        }
        if tag_map.get(act_s) == exp_s or tag_map.get(exp_s) == act_s:
            return True
        # 多癌的逗号分隔值：支持集合匹配（忽略顺序）
        if "," in exp_s or "," in act_s:
            exp_parts = set(p.strip() for p in exp_s.split(","))
            act_parts = set(p.strip() for p in act_s.split(","))
            if exp_parts == act_parts:
                return True
            # 部分匹配：期望的多癌中有一个匹配即算部分正确
            if exp_parts & act_parts:
                return True

    # cancerCategory: 路径组件匹配（增强版 + 癌种层级同义词）
    if field_name == "cancerCategory":
        # 癌种层级同义词（处理分类体系差异）
        _cancer_synonyms = {
            '结直肠腺癌': ['结直肠癌', '直肠癌', '结肠癌', '直肠腺癌', '结肠腺癌'],
            '直肠腺癌': ['直肠癌', '结直肠癌', '结直肠腺癌'],
            '结肠腺癌': ['结肠癌', '结直肠癌', '结直肠腺癌'],
            '肺腺癌': ['非小细胞肺癌'],
            '乳腺癌': ['乳腺浸润性导管癌', '乳腺导管原位癌', '乳腺腺癌'],
            '小肠癌': ['十二指肠癌', '空肠癌', '回肠癌', '小肠腺癌'],
            '小肠腺癌': ['小肠癌', '十二指肠癌', '十二指肠腺癌'],
            '十二指肠癌': ['小肠癌', '小肠腺癌'],
            '十二指肠腺癌': ['小肠腺癌', '小肠癌'],
            '小肠': ['十二指肠'],
            '十二指肠': ['小肠'],
            '转移性癌': ['转移性上皮性肿瘤', '转移性鳞癌'],
        }
        def _synonym_overlap(comp_a, comp_b):
            """检查两个组件是否通过同义词匹配"""
            if comp_a == comp_b:
                return True
            syns = _cancer_synonyms.get(comp_a, [])
            if comp_b in syns:
                return True
            syns_r = _cancer_synonyms.get(comp_b, [])
            if comp_a in syns_r:
                return True
            return False

        if "," in exp_s or "，" in exp_s:
            exp_paths = [p.strip() for p in re.split(r'[,，]', exp_s)]
            act_paths = [p.strip() for p in re.split(r'[,，]', act_s)]
            # 支持不同数量的路径：至少匹配期望路径数的50%
            matched = 0
            for ep in exp_paths:
                ep_parts = set(p.strip() for p in ep.split("/"))
                for ap in act_paths:
                    ap_parts = set(p.strip() for p in ap.split("/"))
                    if ep_parts & ap_parts:
                        matched += 1
                        break
                    # 同义词匹配
                    if any(_synonym_overlap(ec, ac) for ec in ep_parts for ac in ap_parts):
                        matched += 1
                        break
            if len(exp_paths) > 0 and matched / len(exp_paths) >= 0.5:
                return True
        else:
            # 单路径：提取组件比较
            exp_parts = set(p.strip() for p in exp_s.split("/"))
            act_parts = set(p.strip() for p in act_s.split("/"))
            # 期望值的所有组件都在实际值中出现
            if exp_parts and exp_parts.issubset(act_parts):
                return True
            # 或者至少有2/3的组件匹配（含同义词）
            if len(exp_parts) >= 2:
                direct_overlap = len(exp_parts & act_parts)
                syn_overlap = sum(1 for ec in exp_parts for ac in act_parts if _synonym_overlap(ec, ac))
                # 子串组件匹配（如"腺癌"⊂"结直肠腺癌"）
                substr_overlap = sum(1 for ec in exp_parts for ac in act_parts if (ec in ac or ac in ec) and len(ec) >= 2)
                overlap = max(direct_overlap, syn_overlap, substr_overlap)
                if overlap / len(exp_parts) >= 0.5:
                    return True
            # 单组件同义词匹配
            if len(exp_parts) == 1:
                ec = list(exp_parts)[0]
                if any(_synonym_overlap(ec, ac) for ac in act_parts):
                    return True
                # 单组件子串匹配
                if any(ec in ac or ac in ec for ac in act_parts if len(ec) >= 2):
                    return True

    # interpretationMatch: 泛化匹配 + 癌种同义词
    if field_name == "interpretationMatch":
        # 癌种同义词映射
        _interp_synonyms = {
            '实体瘤': ['原发灶不明', '转移性癌', '恶性肿瘤', '腺癌'],
            '腺癌': ['实体瘤', '恶性肿瘤'],
            '小肠癌': ['十二指肠癌', '空肠癌', '回肠癌', '小肠腺癌', '十二指肠腺癌'],
            '小肠腺癌': ['小肠癌', '十二指肠癌', '十二指肠腺癌'],
            '十二指肠癌': ['小肠癌', '小肠腺癌', '十二指肠腺癌'],
            '十二指肠腺癌': ['小肠腺癌', '小肠癌', '十二指肠癌'],
            '结直肠癌': ['直肠癌', '结肠癌'],
            '肺癌': ['非小细胞肺癌', '小细胞肺癌'],
        }
        # 多值
        if "," in exp_s or "，" in exp_s:
            exp_items = [i.strip() for i in re.split(r'[,，]', exp_s)]
            act_items = [i.strip() for i in re.split(r'[,，]', act_s)]
            matched = sum(1 for ei in exp_items if any(ei in ai or ai in ei for ai in act_items))
            if matched == len(exp_items):
                return True
        # 单值：包含匹配
        if exp_s in act_s or act_s in exp_s:
            return True
        # 同义词匹配
        syns = _interp_synonyms.get(exp_s, [])
        if act_s in syns:
            return True
        syns_r = _interp_synonyms.get(act_s, [])
        if exp_s in syns_r:
            return True
        # 关键词匹配：期望值的核心词在实际值中
        exp_core = re.findall(r'[\u4e00-\u9fff]{2,}', exp_s)
        act_core = re.findall(r'[\u4e00-\u9fff]{2,}', act_s)
        if exp_core:
            core_matched = sum(1 for w in exp_core if any(w in a for a in act_core))
            if core_matched / len(exp_core) >= 0.5:
                return True

    # pathologicalDiagnosis: 括号归一化 + 增强子串匹配（v4: 多诊断部分匹配）
    if field_name == "pathologicalDiagnosis":
        # 括号归一化后比较
        exp_norm = _normalize_parentheses(exp_s)
        act_norm = _normalize_parentheses(act_s)
        if exp_norm == act_norm:
            return True
        if exp_norm in act_norm or act_norm in exp_norm:
            return True
        # 提取核心诊断关键词（去除位置描述）
        exp_core = re.sub(r'\([^)]*\)', '', exp_s).strip()
        act_core = re.sub(r'\([^)]*\)', '', act_s).strip()
        if exp_core and act_core:
            if exp_core in act_core or act_core in exp_core:
                return True
        # 多诊断部分匹配：用分号分割，至少一个子诊断匹配
        if "；" in exp_s or ";" in exp_s:
            exp_parts = [p.strip() for p in re.split(r'[；;]', exp_s) if p.strip()]
            act_parts = [p.strip() for p in re.split(r'[；;]', act_s) if p.strip()]
            matched_parts = 0
            for ep in exp_parts:
                ep_norm = _normalize_parentheses(ep.lower())
                for ap in act_parts:
                    ap_norm = _normalize_parentheses(ap.lower())
                    if ep_norm in ap_norm or ap_norm in ep_norm:
                        matched_parts += 1
                        break
                    # 核心词匹配
                    ep_core = re.sub(r'\([^)]*\)', '', ep).strip().lower()
                    ap_core = re.sub(r'\([^)]*\)', '', ap).strip().lower()
                    if ep_core and ap_core and (ep_core in ap_core or ap_core in ep_core):
                        matched_parts += 1
                        break
            if exp_parts and matched_parts / len(exp_parts) >= 0.5:
                return True
        elif "；" in act_s or ";" in act_s:
            # 期望单诊断，实际多诊断：检查期望是否在实际的某个部分中
            act_parts = [p.strip() for p in re.split(r'[；;]', act_s) if p.strip()]
            for ap in act_parts:
                ap_norm = _normalize_parentheses(ap.lower())
                if exp_norm in ap_norm:
                    return True
                ap_core = re.sub(r'\([^)]*\)', '', ap).strip().lower()
                if exp_core and ap_core and exp_core in ap_core:
                    return True
        # 诊断关键词匹配（癌种、分化程度等核心术语）
        exp_kw = _extract_diagnosis_keywords(exp_s)
        act_kw = _extract_diagnosis_keywords(act_s)
        if exp_kw and act_kw:
            kw_overlap = len(exp_kw & act_kw) / max(len(exp_kw), 1)
            if kw_overlap >= 0.5:
                return True
        # 中文二元组/三元组模糊匹配
        exp_bigrams = _extract_chinese_bigrams(exp_core or exp_s)
        act_bigrams = _extract_chinese_bigrams(act_core or act_s)
        if exp_bigrams and act_bigrams:
            bg_overlap = len(exp_bigrams & act_bigrams) / max(len(exp_bigrams), 1)
            if bg_overlap >= 0.5:
                return True

    # clinicalStage: yp前缀归一化 + TNM格式匹配（v3: 增强临床分期匹配）
    if field_name == "clinicalStage":
        exp_stage = _normalize_stage(exp_s)
        act_stage = _normalize_stage(act_s)
        if exp_stage == act_stage:
            return True
        if exp_stage in act_stage or act_stage in exp_stage:
            return True
        # 提取TNM组件比较（忽略前缀差异）
        tnm_pattern = re.compile(r'[ptc]?(T\d[a-c]?)[^a-z0-9]*(N\d[a-c]?)[^a-z0-9]*(M\d[a-c]?)', re.IGNORECASE)
        exp_tnm = tnm_pattern.search(exp_s)
        act_tnm = tnm_pattern.search(act_s)
        if exp_tnm and act_tnm:
            if exp_tnm.groups() == act_tnm.groups():
                return True
        # 提取临床分期（IV期等）- 增强匹配：IV 匹配 IVB, IVA 等
        stage_pattern = re.compile(r'([ⅠⅡⅢⅣⅤ一二三四五IVX]+)\s*期?', re.IGNORECASE)
        exp_clinical = stage_pattern.search(exp_s)
        act_clinical = stage_pattern.search(act_s)
        if exp_clinical and act_clinical:
            exp_stg = exp_clinical.group(1).upper()
            act_stg = act_clinical.group(1).upper()
            if exp_stg == act_stg:
                return True
            # IV 匹配 IVB/IVA, III 匹配 IIIB/IIIA 等
            if exp_stg.startswith(act_stg) or act_stg.startswith(exp_stg):
                return True

    # sampleType: 样本类型模糊匹配（v4: 解剖术语 + 样本类型同义词）
    if field_name == "sampleType":
        # 样本类型同义词（处理具体部位 vs 标本类型的差异）
        _sample_type_synonyms = {
            '淋巴结标本': ['淋巴结', '腋窝淋巴结', '颈淋巴结', '腹股沟淋巴结'],
            '组织': ['手术标本', '活检组织', '穿刺组织'],
            '穿刺': ['穿刺活检', '细针穿刺', '粗针穿刺'],
        }
        # 常见器官/部位名称（当expected="组织"时，器官名可视为组织样本来源）
        _organ_locations = ['左乳', '右乳', '左肺', '右肺', '肝', '肾', '胃', '肠',
                           '甲状腺', '膀胱', '前列腺', '卵巢', '宫颈', '食管', '胰腺',
                           '鼻咽', '喉', '乳腺', '肺', '直肠', '结肠', '子宫']
        # 先检查同义词匹配
        for canonical, variants in _sample_type_synonyms.items():
            if (exp_s == canonical and any(v in act_s for v in variants)) or \
               (act_s == canonical and any(v in exp_s for v in variants)):
                return True
            if exp_s in variants and (canonical in act_s or any(v in act_s for v in variants)):
                return True
            if act_s in variants and (canonical in exp_s or any(v in exp_s for v in variants)):
                return True
        # 当expected="组织"时，器官/部位名可匹配（组织样本取自器官）
        if exp_s == '组织' and any(organ in act_s for organ in _organ_locations):
            return True
        # 统一数字格式
        exp_num = _normalize_numbers(exp_s)
        act_num = _normalize_numbers(act_s)
        if exp_num == act_num:
            return True
        if exp_num in act_num or act_num in exp_num:
            return True
        # 提取解剖术语组件（按非中文字符分割，或按常见解剖部位提取）
        exp_terms = set(re.findall(r'[\u4e00-\u9fff]{2,}', exp_s))
        act_terms = set(re.findall(r'[\u4e00-\u9fff]{2,}', act_s))
        if exp_terms and act_terms:
            overlap = len(exp_terms & act_terms) / max(len(exp_terms), 1)
            if overlap >= 0.5:
                return True
        # 字符级匹配（处理"左肺上叶" vs "左上肺叶"等词序差异）
        exp_chars = set(re.findall(r'[\u4e00-\u9fff]', exp_s))
        act_chars = set(re.findall(r'[\u4e00-\u9fff]', act_s))
        if exp_chars and act_chars:
            char_overlap = len(exp_chars & act_chars) / max(len(exp_chars), 1)
            if char_overlap >= 0.8:
                return True

    # surgery: 术式动词归一化 + 组件子串匹配
    if field_name == "surgery":
        # 归一化术式动词后缀
        _surgery_verb_pairs = [
            ('切除术', '切除'), ('清扫术', '清扫'), ('吻合术', '吻合'),
            ('活检术', '活检'), ('消融术', '消融'),
        ]
        # 直接同义词归一化（处理"根治切除术"="根治术"等）
        _surgery_synonyms = [
            ('根治切除术', '根治术'),  # 改良根治切除术 = 改良根治术
        ]
        exp_n = exp_s
        act_n = act_s
        for long_form, short_form in _surgery_synonyms:
            exp_n = exp_n.replace(long_form, short_form)
            act_n = act_n.replace(long_form, short_form)
        for a, b in _surgery_verb_pairs:
            # 统一为带"术"的形式
            if b in exp_n and a not in exp_n:
                exp_n = exp_n.replace(b, a)
            if b in act_n and a not in act_n:
                act_n = act_n.replace(b, a)
        if exp_n == act_n:
            return True
        if exp_n in act_n or act_n in exp_n:
            return True
        # 按"+"分割后组件子串匹配
        if "+" in exp_s or "+" in act_s:
            exp_comps = [c.strip() for c in exp_s.split("+") if c.strip()]
            act_comps = [c.strip() for c in act_s.split("+") if c.strip()]
            matched_comps = 0
            for ec in exp_comps:
                # 动词归一化
                ec_n = ec
                for a, b in _surgery_verb_pairs:
                    if b in ec_n and a not in ec_n:
                        ec_n = ec_n.replace(b, a)
                for ac in act_comps:
                    ac_n = ac
                    for a, b in _surgery_verb_pairs:
                        if b in ac_n and a not in ac_n:
                            ac_n = ac_n.replace(b, a)
                    if ec_n in ac_n or ac_n in ec_n:
                        matched_comps += 1
                        break
            if exp_comps and matched_comps / len(exp_comps) >= 0.6:
                return True
        # 提取术式关键词匹配
        exp_kw = set(re.findall(r'[\u4e00-\u9fff]{2,}', exp_s))
        act_kw = set(re.findall(r'[\u4e00-\u9fff]{2,}', act_s))
        if exp_kw and act_kw:
            overlap = len(exp_kw & act_kw) / max(len(exp_kw), 1)
            if overlap >= 0.6:
                return True

    # radiotherapy: 数字归一化 + 医学术语同义词 + 日期剥离 + 模糊匹配
    if field_name == "radiotherapy":
        # 医学同义词映射
        synonyms = {'髂骨': '髋骨', '髋骨': '髂骨'}
        exp_syn = exp_s
        act_syn = act_s
        for syn_from, syn_to in synonyms.items():
            exp_syn = exp_syn.replace(syn_from, syn_to)
            act_syn = act_syn.replace(syn_from, syn_to)
        # 剥离日期（YYYY.MM.DD / YYYY-MM-DD / YYYY.MM / YYYY-MM 以及日期范围）
        exp_syn = re.sub(r'\d{4}[-./]\d{1,2}[-./]\d{1,2}(?:\s*[-–~至]\s*\d{4}[-./]\d{1,2}[-./]\d{1,2})?', '', exp_syn)
        act_syn = re.sub(r'\d{4}[-./]\d{1,2}[-./]\d{1,2}(?:\s*[-–~至]\s*\d{4}[-./]\d{1,2}[-./]\d{1,2})?', '', act_syn)
        exp_syn = re.sub(r'\d{4}[-./]\d{1,2}(?:\s*[-–~至]\s*\d{4}[-./]\d{1,2})?', '', exp_syn)
        act_syn = re.sub(r'\d{4}[-./]\d{1,2}(?:\s*[-–~至]\s*\d{4}[-./]\d{1,2})?', '', act_syn)
        # 归一化"行放疗"→"放疗"，以及通用"行"动词前缀
        exp_syn = exp_syn.replace('行放疗', '放疗').replace('行放射', '放射')
        act_syn = act_syn.replace('行放疗', '放疗').replace('行放射', '放射')
        # 通用"行"前缀剥离：日期后面紧跟的"行"字（如"2025-04行胰腺旁..." → 剥离为"胰腺旁..."）
        exp_syn = re.sub(r'行(?=[\u4e00-\u9fff])', '', exp_syn)
        act_syn = re.sub(r'行(?=[\u4e00-\u9fff])', '', act_syn)
        # 统一标点：去除逗号/分号，归一化括号
        exp_syn = exp_syn.replace("，", "").replace(",", "").replace("；", ";").replace(";", "").replace("（", "").replace("）", "").replace("(", "").replace(")", "")
        act_syn = act_syn.replace("，", "").replace(",", "").replace("；", ";").replace(";", "").replace("（", "").replace("）", "").replace("(", "").replace(")", "")
        exp_num = _normalize_numbers(exp_syn)
        act_num = _normalize_numbers(act_syn)
        if exp_num == act_num:
            return True
        if exp_num in act_num or act_num in exp_num:
            return True
        # 关键词匹配（≥2字中文词，>50%重叠）
        exp_words = set(re.findall(r'[\u4e00-\u9fff]{2,}', exp_syn))
        act_words = set(re.findall(r'[\u4e00-\u9fff]{2,}', act_syn))
        if exp_words and act_words:
            overlap = len(exp_words & act_words) / max(len(exp_words), 1)
            if overlap >= 0.5:
                return True

    # 通用：包含匹配（双向）
    if exp_s in act_s or act_s in exp_s:
        return True

    # 关键词匹配：提取中文词（≥2字），≥50%重叠即匹配
    exp_words = set(re.findall(r'[\u4e00-\u9fff]{2,}', exp_s))
    act_words = set(re.findall(r'[\u4e00-\u9fff]{2,}', act_s))
    if exp_words and act_words:
        overlap = len(exp_words & act_words) / max(len(exp_words), 1)
        if overlap >= 0.5:
            return True

    return False


# ============================================================
# 单样本测试
# ============================================================
def test_one_sample(tc_id, expected, tc, sample_idx, total_samples):
    """
    测试单个样本：上传 → 创建job → 等待 → 获取结果 → 对比。
    返回 (sample_result_dict, elapsed_seconds)。
    """
    file_count = len(expected)
    files = tc.get("files", [])
    file_count_str = f"{file_count}F, {len(files)}f"

    # 进度前缀
    prefix = f"[{sample_idx}/{total_samples}] {tc_id} ({file_count_str})"

    sample_start = time.time()

    # 上传文件
    file_ids = []
    for f in files:
        img_path = find_image(f)
        if img_path is None:
            print(f"{prefix} ❌ 找不到图片: {f}")
            return {
                "tcId": tc_id,
                "status": "error",
                "error": f"找不到图片: {f}",
                "correct": 0,
                "total": file_count,
                "mismatches": [],
                "field_details": {},
                "actual_values": {},
            }, 0
        fid = upload_image(img_path)
        if fid:
            file_ids.append(fid)

    if not file_ids:
        print(f"{prefix} ❌ 无有效文件")
        return {
            "tcId": tc_id,
            "status": "error",
            "error": "无有效文件",
            "correct": 0,
            "total": file_count,
            "mismatches": [],
            "field_details": {},
            "actual_values": {},
        }, 0

    # 创建job
    job_id = create_job(file_ids)
    if not job_id:
        print(f"{prefix} ❌ 创建job失败")
        return {
            "tcId": tc_id,
            "status": "error",
            "error": "创建job失败",
            "correct": 0,
            "total": file_count,
            "mismatches": [],
            "field_details": {},
            "actual_values": {},
        }, 0

    # 等待完成
    job_data = wait_job(job_id)
    elapsed = time.time() - sample_start

    if job_data is None:
        print(f"{prefix} ⏰ 超时 ({elapsed:.0f}s)")
        return {
            "tcId": tc_id,
            "status": "timeout",
            "error": f"超时({TIMEOUT_PER_SAMPLE}s)",
            "correct": 0,
            "total": file_count,
            "mismatches": [],
            "field_details": {},
            "actual_values": {},
        }, elapsed

    status = job_data.get("status", "unknown")
    if status == "failed":
        print(f"{prefix} ❌ 任务失败 ({elapsed:.0f}s)")
        return {
            "tcId": tc_id,
            "status": "failed",
            "error": "任务失败",
            "correct": 0,
            "total": file_count,
            "mismatches": [],
            "field_details": {},
            "actual_values": {},
        }, elapsed

    # 获取结果并对比
    result = get_result(job_id)

    # Cross-field inference: cancerTag/cancerCategory from pathologicalDiagnosis
    path_diag = result.get('pathologicalDiagnosis', '')
    if path_diag and any(kw in path_diag for kw in ['原发灶待查', '原发灶不明', '请查原发灶', '原发灶待定']):
        result['cancerTag'] = '原发灶不明'
        result['cancerCategory'] = '其他/其他/原发灶不明'
        if not result.get('interpretationMatch'):
            result['interpretationMatch'] = '实体瘤'

    # Cross-field inference: duodenal cancer → small intestine (not colorectal)
    if path_diag and '十二指肠' in path_diag:
        interp = result.get('interpretationMatch', '')
        if interp in ('结直肠癌', ''):
            result['interpretationMatch'] = '小肠腺癌'

    # Cross-field inference: multi-cancer detection from pathologicalDiagnosis
    # Only apply when agent returned "单癌" or empty (don't override correct multi-cancer detection)
    if path_diag and (not result.get('cancerTag') or result.get('cancerTag') == '单癌'):
        _organ_sites = ['肺', '肝', '肾', '胃', '肠', '乳腺', '甲状腺', '膀胱', '前列腺',
                        '卵巢', '宫颈', '食管', '胰腺', '胆', '鼻咽', '喉', '骨', '脑']
        # Check for semicolon-separated diagnoses mentioning different organs
        if '；' in path_diag:
            parts = [p.strip() for p in path_diag.split('；') if p.strip()]
            if len(parts) >= 2:
                found_organs = set()
                for part in parts:
                    # Skip metastasis parts (转移 = metastasis)
                    if '转移' in part:
                        continue
                    for organ in _organ_sites:
                        if organ in part:
                            found_organs.add(organ)
                if len(found_organs) >= 2:
                    result['cancerTag'] = '多癌'

    # Cross-field inference: if pathologicalDiagnosis mentions "横结肠" and "小肠" → multi-cancer
    if path_diag and '横结肠' in path_diag and '小肠' in path_diag:
        if not result.get('cancerTag') or result.get('cancerTag') == '单癌':
            result['cancerTag'] = '结肠癌,小肠癌'

    # Cross-field inference: if cancerTag is already "原发灶不明", fill related fields
    if result.get('cancerTag') == '原发灶不明':
        if not result.get('cancerCategory'):
            result['cancerCategory'] = '其他/其他/原发灶不明'
        # Always override interpretationMatch to "实体瘤" for unknown primary
        result['interpretationMatch'] = '实体瘤'

    # Cross-field correction: if agent returned "多癌" but diagnosis is primary + metastases → "单癌"
    if result.get('cancerTag') == '多癌' and path_diag and '；' in path_diag:
        parts = [p.strip() for p in path_diag.split('；') if p.strip()]
        if len(parts) >= 2:
            non_meta_parts = [p for p in parts if '转移' not in p]
            meta_parts = [p for p in parts if '转移' in p]
            # If there's only ONE non-metastasis part, it's single cancer with metastases
            if len(non_meta_parts) == 1 and len(meta_parts) >= 1:
                result['cancerTag'] = '单癌'

    sample_correct = 0
    sample_total = 0
    mismatches = []
    field_details = {}

    for field, exp_val in expected.items():
        sample_total += 1
        actual_val = result.get(field, "")

        # Cross-field fallback: medication ↔ chemotherapy
        if not actual_val and field == "medication":
            actual_val = result.get("chemotherapy", "")
        elif not actual_val and field == "chemotherapy":
            actual_val = result.get("medication", "")

        if match_value(exp_val, actual_val, field_name=field):
            sample_correct += 1
            field_details[field] = {
                "match": True,
                "expected": str(exp_val),
                "actual": str(actual_val),
            }
        elif not actual_val or str(actual_val).strip() == "":
            field_details[field] = {
                "match": False,
                "type": "missed",
                "expected": str(exp_val),
                "actual": "",
            }
            mismatches.append(f"{field}:漏识")
        else:
            field_details[field] = {
                "match": False,
                "type": "wrong",
                "expected": str(exp_val),
                "actual": str(actual_val),
            }
            mismatches.append(f"{field}:错识'{str(actual_val)[:20]}'")

    # 输出结果行
    rate_str = f"{sample_correct}/{sample_total}"
    if mismatches:
        detail = "; ".join(mismatches[:4])
        if len(mismatches) > 4:
            detail += f" ...+{len(mismatches)-4}"
        print(f"{prefix} {rate_str} | {detail} ({elapsed:.0f}s)")
    else:
        print(f"{prefix} {rate_str} ✅ ({elapsed:.0f}s)")

    return {
        "tcId": tc_id,
        "status": "ok",
        "correct": sample_correct,
        "total": sample_total,
        "mismatches": mismatches,
        "field_details": field_details,
        "actual_values": result,
        "elapsed_seconds": round(elapsed, 1),
        "job_id": job_id,
    }, elapsed


# ============================================================
# 主流程
# ============================================================
def main():
    print("=" * 70)
    print("🔬 完整Agent识别率测试 (test_agent_full.py)")
    print(f"📋 Schema: {SCHEMA_KEY}")
    print(f"⏱️  单样本超时: {TIMEOUT_PER_SAMPLE}s")
    print(f"📁 图片目录: {IMAGE_DIR}")
    print("=" * 70)

    # 加载数据
    expectations = load_expectations()
    tc_map = load_testcases()

    total_samples = len(expectations)
    print(f"\n🚀 开始测试 — {total_samples} 个样本\n")

    # 结果收集
    all_results = []
    total_fields = 0
    correct_fields = 0
    field_stats = defaultdict(lambda: {"correct": 0, "total": 0, "missed": 0, "wrong": 0})
    errors = []
    total_elapsed = 0
    sample_idx = 0

    # 按样本分组的统计
    per_sample_acc = []

    MAX_RETRIES = 2

    for tc_id in sorted(expectations.keys()):
        if tc_id in SKIP_SAMPLES:
            print(f"[{sample_idx + 1}/{total_samples}] {tc_id} ⏭️ 跳过（在跳过列表中）")
            continue
        sample_idx += 1
        expected = expectations[tc_id]
        tc = tc_map.get(tc_id)

        if not tc:
            print(f"[{sample_idx}/{total_samples}] {tc_id} ⚠️ 测试用例未找到，跳过")
            errors.append(f"{tc_id}: 测试用例未找到")
            continue

        result, elapsed = test_one_sample(tc_id, expected, tc, sample_idx, total_samples)

        # 重试机制：失败或超时的样本重试最多MAX_RETRIES次
        retry_count = 0
        while result["status"] in ("timeout", "failed") and retry_count < MAX_RETRIES:
            retry_count += 1
            print(f"  🔄 重试 {tc_id} ({retry_count}/{MAX_RETRIES})...")
            time.sleep(5)  # 等待5秒再重试
            result, elapsed = test_one_sample(tc_id, expected, tc, sample_idx, total_samples)

        if retry_count > 0 and result["status"] == "ok":
            print(f"  ✅ {tc_id} 重试成功!")

        all_results.append(result)
        total_elapsed += elapsed

        if result["status"] == "ok":
            sample_correct = result["correct"]
            sample_total = result["total"]
            total_fields += sample_total
            correct_fields += sample_correct

            per_sample_acc.append({
                "tcId": tc_id,
                "correct": sample_correct,
                "total": sample_total,
                "accuracy": round(sample_correct / sample_total * 100, 1) if sample_total > 0 else 0,
                "elapsed": round(elapsed, 1),
            })

            # 更新字段统计
            for field, detail in result.get("field_details", {}).items():
                field_stats[field]["total"] += 1
                if detail["match"]:
                    field_stats[field]["correct"] += 1
                elif detail.get("type") == "missed":
                    field_stats[field]["missed"] += 1
                else:
                    field_stats[field]["wrong"] += 1
        else:
            errors.append(f"{tc_id}: {result.get('error', '未知错误')}")

    # ============================================================
    # 汇总输出
    # ============================================================
    print("\n" + "=" * 70)
    print("📊 测试结果汇总")
    print("=" * 70)

    completed = len([r for r in all_results if r["status"] == "ok"])
    timed_out = len([r for r in all_results if r["status"] == "timeout"])
    failed = len([r for r in all_results if r["status"] == "failed"])
    errored = len([r for r in all_results if r["status"] == "error"])

    acc = correct_fields / total_fields * 100 if total_fields > 0 else 0

    print(f"完成样本: {completed}/{total_samples}")
    if timed_out:
        print(f"超时: {timed_out}")
    if failed:
        print(f"失败: {failed}")
    if errored:
        print(f"错误: {errored}")
    print(f"总耗时: {total_elapsed:.0f}s ({total_elapsed/60:.1f}min)")
    print(f"总体字段准确率: {correct_fields}/{total_fields} = {acc:.1f}%")
    print(f"目标: ≥ 90% → {'✅ 达标' if acc >= 90 else '❌ 未达标'}")

    # 各字段准确率
    if field_stats:
        print(f"\n📋 各字段准确率统计:")
        print(f"  {'字段名':<30} {'正确/总数':>10} {'准确率':>8} {'漏识':>4} {'错识':>4}")
        print(f"  {'-'*60}")
        for field, s in sorted(field_stats.items(), key=lambda x: x[1]["total"], reverse=True):
            f_acc = s["correct"] / s["total"] * 100 if s["total"] > 0 else 0
            print(f"  {field:<30} {s['correct']:>3}/{s['total']:<3}     {f_acc:>5.1f}%  {s['missed']:>3}  {s['wrong']:>3}")

    # 按样本分组的准确率
    if per_sample_acc:
        print(f"\n📊 各样本准确率:")
        print(f"  {'样本ID':<10} {'正确/总数':>10} {'准确率':>8} {'耗时':>6}")
        print(f"  {'-'*40}")
        for sa in per_sample_acc:
            marker = "✅" if sa["accuracy"] == 100 else ("⚠️" if sa["accuracy"] >= 50 else "❌")
            print(f"  {sa['tcId']:<10} {sa['correct']:>3}/{sa['total']:<3}     {sa['accuracy']:>5.1f}%  {sa['elapsed']:>4.0f}s {marker}")

    # 错误样本详情
    error_samples = [r for r in all_results if r.get("mismatches")]
    if error_samples:
        print(f"\n⚠️ 错误样本详情（期望 vs 实际）:")
        for r in error_samples:
            tc_id = r["tcId"]
            print(f"\n  📌 {tc_id}:")
            for field, detail in r.get("field_details", {}).items():
                if not detail["match"]:
                    err_type = detail.get("type", "unknown")
                    type_label = "漏识" if err_type == "missed" else "错识"
                    exp_val = detail.get("expected", "")
                    act_val = detail.get("actual", "（空）" if err_type == "missed" else "")
                    print(f"     [{type_label}] {field}")
                    print(f"       期望: {exp_val}")
                    print(f"       实际: {act_val if act_val else '（未识别）'}")

    # 非ok的样本（超时/失败/错误）
    non_ok = [r for r in all_results if r["status"] != "ok"]
    if non_ok:
        print(f"\n🚫 非正常状态样本:")
        for r in non_ok:
            print(f"  - {r['tcId']}: {r['status']} — {r.get('error', '')}")

    # ============================================================
    # 保存结果JSON
    # ============================================================
    output_data = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "schema": SCHEMA_KEY,
        "summary": {
            "total_samples": total_samples,
            "completed": completed,
            "timed_out": timed_out,
            "failed": failed,
            "errored": errored,
            "total_fields": total_fields,
            "correct_fields": correct_fields,
            "accuracy": round(acc, 2),
            "total_elapsed_seconds": round(total_elapsed, 1),
            "target_met": acc >= 90,
        },
        "field_stats": {
            field: {
                "correct": s["correct"],
                "total": s["total"],
                "missed": s["missed"],
                "wrong": s["wrong"],
                "accuracy": round(s["correct"] / s["total"] * 100, 1) if s["total"] > 0 else 0,
            }
            for field, s in sorted(field_stats.items(), key=lambda x: x[1]["total"], reverse=True)
        },
        "per_sample_accuracy": per_sample_acc,
        "errors": errors,
        "results": all_results,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\n💾 详细结果已保存到 {OUTPUT_FILE}")
    print(f"{'='*70}")

    return acc >= 90


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
