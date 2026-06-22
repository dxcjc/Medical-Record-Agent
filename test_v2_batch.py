#!/usr/bin/env python3
"""批量测试 V2 Schema，每个样本输出对比结果"""
import sys, json, time
sys.path.insert(0, '.')
from test_agent_full import load_expectations, load_testcases, test_one_sample

expectations = load_expectations()
tc_map = load_testcases()

# 测试前10个样本
test_ids = ['TC001', 'TC002', 'TC003', 'TC004', 'TC005', 'TC006', 'TC007', 'TC008', 'TC009', 'TC010']

results = []
for tc_id in test_ids:
    expected = expectations[tc_id]
    tc = tc_map.get(tc_id)
    if not tc:
        print(f'{tc_id}: 未找到测试用例')
        continue
    
    result, elapsed = test_one_sample(tc_id, expected, tc, 1, 1)
    results.append(result)
    
    icon = '✅' if result['correct'] == result['total'] else '⚠️' if result['correct'] > 0 else '❌'
    print(f"{icon} {tc_id}: {result['correct']}/{result['total']} ({elapsed:.0f}s)")
    if result.get('mismatches'):
        for m in result['mismatches'][:3]:
            print(f"   └─ {m}")
    print()

# 汇总
total_correct = sum(r['correct'] for r in results)
total_fields = sum(r['total'] for r in results)
accuracy = total_correct / total_fields * 100 if total_fields > 0 else 0
print(f"{'='*50}")
print(f"前10样本准确率: {accuracy:.1f}% ({total_correct}/{total_fields})")
