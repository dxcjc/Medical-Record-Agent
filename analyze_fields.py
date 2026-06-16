#!/usr/bin/env python3
import json, re

# 加载OCR结果
try:
    with open('all_ocr_results.json') as f:
        data = json.load(f)
except FileNotFoundError:
    print("错误：未找到 all_ocr_results.json，请先运行 batch_ocr.py")
    exit(1)

print(f"加载 {len(data)} 个样本的OCR结果")

# 定义字段模式（根据方法论中的示例）
field_patterns = {
    # Tier 1 必填（>50%）
    "患者姓名": [r"姓名[：:]\s*(\S+)", r"患者姓名", r"姓\s*名"],
    "癌种/肿瘤类型": [r"癌种", r"恶性肿瘤", r"腺癌", r"鳞癌", r"肉瘤", r"淋巴瘤", r"乳腺癌", r"肺癌", r"胃癌", r"结直肠癌", r"甲状腺癌", r"肝癌", r"胰腺癌", r"卵巢癌", r"宫颈癌", r"前列腺癌", r"膀胱癌", r"肾癌", r"食管癌", r"鼻咽癌", r"黑色素瘤"],
    "临床诊断": [r"临床诊断"],
    "病理诊断": [r"病理诊断", r"病理报告", r"病理结果"],
    "医院名称": [r"医院", r"肿瘤医院", r"人民医院", r"中心医院", r"附属医院"],
    
    # Tier 2 强期望（30-50%）
    "性别": [r"性别", r"□男.*□女", r"男\s*□", r"女\s*□", r"性别[：:]\s*男女"],
    "样本类型": [r"样本类型", r"标本类型", r"石蜡切片", r"穿刺", r"活检", r"手术标本", r"胸水", r"全血", r"组织"],
    "检测项目": [r"基因", r"检测项目", r"免疫组化", r"MRD", r"检测", r"基因检测", r"肿瘤基因"],
    "报告日期": [r"报告日期", r"诊断日期", r"送检日期", r"检查日期", r"日期"],
    "送检医师": [r"送检医师", r"送检医生", r"医师", r"医生"],
    "治疗史": [r"治疗史", r"手术史", r"化疗", r"放疗", r"用药", r"治疗", r"手术"],
    
    # Tier 3 选填（<30%）
    "年龄": [r"年龄", r"\d+\s*岁"],
    "科室": [r"科室", r"诊室"],
    "病理号": [r"病理号", r"病理编号"],
    "分期": [r"分期", r"TNM", r"T\d+", r"N\d+", r"M\d+"],
    "转移状态": [r"转移", r"淋巴结"],
    "吸烟史": [r"吸烟", r"吸烟史"],
    "备注": [r"备注", r"特殊说明", r"注意"],
    "送检日期": [r"送检日期"],
    "样本编号": [r"样本编号", r"标本编号"],
    "肿瘤分级": [r"分级", r"高分化", r"中分化", r"低分化"],
    "免疫组化": [r"免疫组化", r"IHC"],
    "分子检测": [r"分子检测", r"基因检测", r"PCR", r"NGS"],
    "镜下所见": [r"镜下所见", r"显微镜"],
    "大体所见": [r"大体所见", r"肉眼所见"],
    "病理医师": [r"病理医师", r"报告医师"],
    "门诊号": [r"门诊号"],
    "住院号": [r"住院号"],
    "身份证号": [r"身份证", r"护照"],
    "联系电话": [r"联系电话", r"电话"],
    "民族": [r"民族"],
    "输血史": [r"输血史"],
    "家族史": [r"家族史", r"家族肿瘤史"],
    "高血压病史": [r"高血压"],
    "糖尿病史": [r"糖尿病"],
}

# 分析每个样本
sample_fields = {}
for sid, info in data.items():
    if 'error' in info:
        continue
    full_text = ' '.join(info.get('ocr_texts', []))
    found = []
    for field, patterns in field_patterns.items():
        if any(re.search(p, full_text, re.IGNORECASE) for p in patterns):
            found.append(field)
    sample_fields[sid] = found

# 统计频率
field_counts = {f: sum(1 for fs in sample_fields.values() if f in fs) for f in field_patterns}
total_samples = len(sample_fields)

print(f"\n📊 字段频率统计（共 {total_samples} 个有效样本）")
print("=" * 60)

# 按频率排序
sorted_fields = sorted(field_counts.items(), key=lambda x: -x[1])

# 分层
tier1 = []  # >50%
tier2 = []  # 30-50%
tier3 = []  # <30%
remove = [] # 0%

for field, count in sorted_fields:
    pct = count / total_samples * 100
    if pct > 50:
        tier1.append((field, count, pct))
    elif pct >= 30:
        tier2.append((field, count, pct))
    elif pct > 0:
        tier3.append((field, count, pct))
    else:
        remove.append((field, count, pct))

print(f"\n🔴 Tier 1 必填（>50%）- {len(tier1)} 个字段")
print("-" * 40)
for field, count, pct in tier1:
    print(f"  {field:12} {count:3}/{total_samples} ({pct:5.1f}%)")

print(f"\n🟡 Tier 2 强期望（30-50%）- {len(tier2)} 个字段")
print("-" * 40)
for field, count, pct in tier2:
    print(f"  {field:12} {count:3}/{total_samples} ({pct:5.1f}%)")

print(f"\n🟢 Tier 3 选填（<30%）- {len(tier3)} 个字段")
print("-" * 40)
for field, count, pct in tier3:
    print(f"  {field:12} {count:3}/{total_samples} ({pct:5.1f}%)")

print(f"\n⚪ 去掉（0%）- {len(remove)} 个字段")
print("-" * 40)
for field, count, pct in remove:
    print(f"  {field:12}")

# 保存结果
result = {
    "total_samples": total_samples,
    "tier1_required": [{"field": f, "count": c, "percentage": p} for f, c, p in tier1],
    "tier2_expected": [{"field": f, "count": c, "percentage": p} for f, c, p in tier2],
    "tier3_optional": [{"field": f, "count": c, "percentage": p} for f, c, p in tier3],
    "remove": [f for f, c, p in remove],
    "all_fields": {f: {"count": c, "percentage": round(c/total_samples*100, 1)} for f, c in sorted_fields}
}

with open("field_frequency_analysis.json", "w") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"\n结果已保存到 field_frequency_analysis.json")

# 建议Schema字段数
total_tier1_tier2 = len(tier1) + len(tier2)
print(f"\n💡 Schema 设计建议")
print("=" * 60)
print(f"Tier 1 + Tier 2 字段数: {total_tier1_tier2}")
if total_tier1_tier2 > 20:
    print("⚠️  超过20个字段，可能导致MODEL_OUTPUT_MALFORMED")
    print("   建议：只保留Tier 1 + 部分重要的Tier 2字段")
elif total_tier1_tier2 > 15:
    print("✅ 字段数适中（15-20），识别率应该稳定")
else:
    print("✅ 字段数较少（<15），识别率会很高但可能遗漏信息")

print(f"\n建议的Schema字段（Tier 1 + Tier 2）：")
for field, count, pct in tier1 + tier2:
    print(f"  - {field} ({pct:.1f}%)")