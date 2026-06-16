#!/usr/bin/env python3
"""Schema 优化方案：简化字段 + 添加知识库"""
import json, subprocess, os

os.environ['DATABASE_URL'] = 'postgresql://postgres:postgres@localhost:5432/medical_record_agent'
os.environ['JWT_SECRET'] = 'medical-dev-jwt-secret-20260612-secure-key'

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
    return result.stdout.strip()

def get_token():
    cmd = """cd /tmp/Medical-Record-Agent && node -e "
const crypto = require('crypto');
const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const payload = Buffer.from(JSON.stringify({
  sub:'cmq38kgg50003wmziry1g9ce6',
  permissions:['job:create','job:read','job:review','feedback:create','feedback:review','schema:read','schema:draft','schema:publish','evaluation:manage','audit:read','provider:manage','writeback:execute'],
  roles:['admin'],
  authType:'jwt',
  iat:Math.floor(Date.now()/1000),
  exp:Math.floor(Date.now()/1000)+7*24*60*60
})).toString('base64url');
const signature = crypto.createHmac('sha256',process.env.JWT_SECRET).update(header+'.'+payload).digest('base64url');
console.log(header+'.'+payload+'.'+signature);
" """
    return run_cmd(cmd)

# Schema 定义
schema_definition = {
    "key": "general-medical-record-v2",
    "name": "通用病历识别 v2",
    "label": "通用病历识别 v2",
    "fields": [
        {"key": "patientName", "type": "string", "label": "患者姓名", "required": True,
         "comments": ["从文档中提取患者姓名，通常在顶部"]},
        {"key": "tumorType", "type": "string", "label": "癌种/肿瘤类型", "required": True,
         "comments": ["从诊断信息中提取癌种，如：肺癌、乳腺癌、胃癌等"]},
        {"key": "hospitalName", "type": "string", "label": "医院名称", "required": True,
         "comments": ["从文档头部或页眉提取医院名称"]},
        {"key": "patientGender", "type": "string", "label": "性别",
         "comments": ["提取性别信息：男/女"]},
        {"key": "testItems", "type": "string", "label": "检测项目",
         "comments": ["提取检测项目名称，如：基因检测、免疫组化、病理检测等"]},
        {"key": "sampleType", "type": "string", "label": "样本类型",
         "comments": ["提取样本类型：组织、血液、胸水、骨髓等"]},
        {"key": "pathologicalDiagnosis", "type": "string", "label": "病理诊断",
         "comments": ["从病理诊断字段提取诊断结论"]},
        {"key": "clinicalDiagnosis", "type": "string", "label": "临床诊断",
         "comments": ["从临床诊断字段提取诊断信息"]},
        {"key": "patientAge", "type": "string", "label": "年龄",
         "comments": ["提取年龄信息，如：45岁"]},
        {"key": "treatmentHistory", "type": "string", "label": "治疗史",
         "comments": ["提取治疗史信息：手术、化疗、放疗、靶向治疗等"]},
        {"key": "metastasis", "type": "string", "label": "转移状态",
         "comments": ["提取转移信息：有/无转移，转移部位"]},
        {"key": "immunohistochemistry", "type": "string", "label": "免疫组化",
         "comments": ["提取免疫组化结果，如：ER+、PR+、HER2-等"]},
    ],
    "locale": "zh-CN",
    "version": "2.0.0",
    "validation": {
        "requiredEvidenceFields": ["patientName", "tumorType", "hospitalName"],
        "missingRequiredFieldDecision": "needs_review"
    },
    "evidencePolicy": {
        "required": True,
        "minConfidence": 0.6,
        "requireSourceText": True,
        "requirePageReference": True
    },
    "description": "通用病历识别Schema v2，精简12字段，去掉枚举类型，配合知识库提升识别率"
}

# 知识库条目
knowledge_entries = [
    {
        "kind": "cancer_type",
        "title": "常见癌种类型",
        "content": "肺癌、乳腺癌、胃癌、结直肠癌、肝癌、胰腺癌、食管癌、甲状腺癌、卵巢癌、宫颈癌、前列腺癌、膀胱癌、肾癌、鼻咽癌、淋巴瘤、白血病、黑色素瘤、骨肉瘤、胶质瘤、胃肠道间质瘤",
        "keywords": ["癌种", "肿瘤类型", "恶性肿瘤", "癌症"],
        "fieldKeys": ["tumorType"]
    },
    {
        "kind": "sample_type",
        "title": "常见样本类型",
        "content": "组织、血液、胸水、骨髓、脑脊液、腹水、心包积液、穿刺活检、手术标本、内镜活检、石蜡切片、冰冻切片",
        "keywords": ["样本", "标本", "组织", "血液"],
        "fieldKeys": ["sampleType"]
    },
    {
        "kind": "test_items",
        "title": "常见检测项目",
        "content": "基因检测、免疫组化、病理检测、PD-L1检测、MSI检测、TMB检测、NGS检测、PCR检测、FISH检测、ER/PR/HER2检测、EGFR突变检测、ALK融合检测、ROS1融合检测、BRAF突变检测、KRAS突变检测",
        "keywords": ["检测", "基因", "免疫组化", "病理"],
        "fieldKeys": ["testItems"]
    },
    {
        "kind": "treatment",
        "title": "常见治疗方式",
        "content": "手术、化疗、放疗、靶向治疗、免疫治疗、内分泌治疗、介入治疗、射频消融、粒子植入、骨髓移植",
        "keywords": ["治疗", "手术", "化疗", "放疗"],
        "fieldKeys": ["treatmentHistory"]
    },
    {
        "kind": "hospital",
        "title": "常见医院名称格式",
        "content": "XX医院、XX人民医院、XX中心医院、XX大学附属医院、XX肿瘤医院、XX胸科医院、XX妇幼保健院",
        "keywords": ["医院", "人民医院", "中心医院"],
        "fieldKeys": ["hospitalName"]
    },
    {
        "kind": "ihc_markers",
        "title": "常见免疫组化标记物",
        "content": "ER(雌激素受体)、PR(孕激素受体)、HER2(人表皮生长因子受体2)、Ki-67(增殖指数)、PD-L1(程序性死亡配体1)、CK(细胞角蛋白)、Vimentin(波形蛋白)、CD3、CD20、CD68、S-100、HMB-45、Melan-A",
        "keywords": ["免疫组化", "IHC", "ER", "PR", "HER2"],
        "fieldKeys": ["immunohistochemistry"]
    },
    {
        "kind": "metastasis_sites",
        "title": "常见转移部位",
        "content": "淋巴结转移、肝转移、肺转移、骨转移、脑转移、腹膜转移、胸膜转移、肾上腺转移",
        "keywords": ["转移", "淋巴结", "肝转移", "肺转移"],
        "fieldKeys": ["metastasis"]
    }
]

def main():
    token = get_token()
    print(f"Token: {token[:20]}...")
    
    # 1. 创建 Schema 草稿
    print("\n=== 创建 Schema 草稿 ===")
    create_payload = json.dumps({
        "schemaKey": "general-medical-record-v2",
        "displayName": "通用病历识别 v2",
        "definition": schema_definition
    })
    
    result = run_cmd(f"""curl -s http://localhost:3000/schemas/drafts -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer {token}" \
      -d '{create_payload}'""")
    
    try:
        resp = json.loads(result)
        draft_id = resp.get('draft', {}).get('id')
        if draft_id:
            print(f"✅ 草稿创建成功: {draft_id}")
        else:
            print(f"❌ 草稿创建失败: {result[:200]}")
            return
    except:
        print(f"❌ 草稿创建失败: {result[:200]}")
        return
    
    # 2. 更新草稿（完整 definition）
    print("\n=== 更新草稿 ===")
    update_payload = json.dumps({"definition": schema_definition})
    result = run_cmd(f"""curl -s http://localhost:3000/schemas/drafts/{draft_id} -X PUT \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer {token}" \
      -d '{update_payload}'""")
    print(f"更新结果: {result[:100]}")
    
    # 3. 验证草稿
    print("\n=== 验证草稿 ===")
    result = run_cmd(f"""curl -s http://localhost:3000/schemas/drafts/{draft_id}/validate -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer {token}" \
      -d '{update_payload}'""")
    print(f"验证结果: {result[:200]}")
    
    # 4. 发布 Schema
    print("\n=== 发布 Schema ===")
    result = run_cmd(f"""curl -s http://localhost:3000/schemas/drafts/{draft_id}/publish -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer {token}" \
      -d '{{"changelog": "v2: 精简12字段，去掉枚举，配合知识库"}}'""")
    
    try:
        resp = json.loads(result)
        if 'version' in resp:
            print(f"✅ Schema 发布成功: {resp['version'].get('id')}")
        else:
            print(f"❌ 发布失败: {result[:200]}")
    except:
        print(f"❌ 发布失败: {result[:200]}")
    
    # 5. 添加知识库条目
    print("\n=== 添加知识库条目 ===")
    for entry in knowledge_entries:
        entry_payload = json.dumps(entry)
        result = run_cmd(f"""curl -s http://localhost:3000/knowledge -X POST \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer {token}" \
          -d '{entry_payload}'""")
        
        try:
            resp = json.loads(result)
            if 'id' in resp:
                print(f"✅ {entry['title']}: {resp['id']}")
            else:
                print(f"❌ {entry['title']}: {result[:100]}")
        except:
            print(f"❌ {entry['title']}: {result[:100]}")
    
    print("\n=== 完成 ===")

if __name__ == "__main__":
    main()
