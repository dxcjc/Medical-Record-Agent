#!/usr/bin/env python3
"""多文件合并任务测试"""
import json, base64, os, time, subprocess

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

# 多文件合并任务组
merge_groups = [
    {
        "name": "余明明",
        "files": [
            "固定测试集共45个样本/3测试上传的不同类型图片能否准确识别7/260518307测同时上传3张资料余明明1.png",
            "固定测试集共45个样本/3测试上传的不同类型图片能否准确识别7/260518307测同时上传3张资料余明明2.png",
            "固定测试集共45个样本/3测试上传的不同类型图片能否准确识别7/260518307测同时上传3张资料余明明3.png",
        ]
    },
    {
        "name": "李月娥",
        "files": [
            "固定测试集共45个样本/5资料多样本测试5/260518501李月娥用药多/李月娥应该录入为.png",
            "固定测试集共45个样本/5资料多样本测试5/260518501李月娥用药多/用药非常多李月娥1.png",
            "固定测试集共45个样本/5资料多样本测试5/260518501李月娥用药多/用药非常多李月娥2.png",
        ]
    },
    {
        "name": "马辉",
        "files": [
            "固定测试集共45个样本/5资料多样本测试5/260518502马辉资料多/ScreenShot_2026-04-21_170216_488.png",
            "固定测试集共45个样本/5资料多样本测试5/260518502马辉资料多/马辉1.png",
            "固定测试集共45个样本/5资料多样本测试5/260518502马辉资料多/马辉2.png",
            "固定测试集共45个样本/5资料多样本测试5/260518502马辉资料多/马辉3.png",
        ]
    },
    {
        "name": "浦慧敏(同一样本)",
        "files": [
            "固定测试集共45个样本/5资料多样本测试5/260518503浦慧敏资料多/同一样本1.png",
            "固定测试集共45个样本/5资料多样本测试5/260518503浦慧敏资料多/同一样本2.png",
            "固定测试集共45个样本/5资料多样本测试5/260518503浦慧敏资料多/同一样本3.png",
        ]
    },
    {
        "name": "张勇(资料多)",
        "files": [
            "固定测试集共45个样本/5资料多样本测试5/260518505张勇资料多/资料多1张勇261005348ScreenShot_2026-03-23_142707_638.png",
            "固定测试集共45个样本/5资料多样本测试5/260518505张勇资料多/资料多2张勇261005348.png",
            "固定测试集共45个样本/5资料多样本测试5/260518505张勇资料多/资料多3张勇261005348.png",
            "固定测试集共45个样本/5资料多样本测试5/260518505张勇资料多/资料多4张勇261005348.png",
            "固定测试集共45个样本/5资料多样本测试5/260518505张勇资料多/资料多5张勇261005348.png",
            "固定测试集共45个样本/5资料多样本测试5/260518505张勇资料多/资料多6张勇261005348.png",
            "固定测试集共45个样本/5资料多样本测试5/260518505张勇资料多/资料多7张勇261005348.png",
            "固定测试集共45个样本/5资料多样本测试5/260518505张勇资料多/资料多8张勇261005348.png",
        ]
    },
]

def upload_file(token, image_path):
    """上传文件，返回file_id"""
    filename = os.path.basename(image_path)
    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()
    
    payload = json.dumps({
        "originalName": filename,
        "mimeType": "image/png",
        "contentBase64": img_b64
    })
    
    tmp_file = f"/tmp/mra_merge_{filename}.json"
    with open(tmp_file, "w") as f:
        f.write(payload)
    
    result = run_cmd(f"""curl -s http://localhost:3000/files -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer {token}" \
      -d @{tmp_file}""")
    
    try:
        resp = json.loads(result)
        return resp.get('id')
    except:
        return None

def create_merge_job(token, file_ids):
    """创建多文件合并任务"""
    payload = json.dumps({
        "schemaKey": "general-medical-record",
        "sourceFileIds": file_ids
    })
    
    result = run_cmd(f"""curl -s http://localhost:3000/jobs -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer {token}" \
      -d '{payload}'""")
    
    try:
        resp = json.loads(result)
        return resp.get('id')
    except:
        return None

def check_job(token, job_id):
    result = run_cmd(f"""curl -s "http://localhost:3000/jobs/{job_id}" -H "Authorization: Bearer {token}" """)
    try:
        data = json.loads(result)
        return data.get('status'), data.get('error')
    except:
        return 'error', None

def get_result(token, job_id):
    result = run_cmd(f"""curl -s "http://localhost:3000/results/{job_id}" -H "Authorization: Bearer {token}" """)
    try:
        return json.loads(result)
    except:
        return None

def main():
    token = get_token()
    if not token:
        print("Token获取失败")
        return
    print(f"Token: {token[:20]}...")
    
    results = []
    
    for group in merge_groups:
        name = group['name']
        files = group['files']
        print(f"\n=== {name} ({len(files)} 张图片) ===")
        
        # 上传所有文件
        file_ids = []
        for f in files:
            full_path = f"/tmp/Medical-Record-Agent/{f}"
            print(f"  上传: {os.path.basename(f)}")
            file_id = upload_file(token, full_path)
            if file_id:
                file_ids.append(file_id)
                print(f"    ✅ {file_id}")
            else:
                print(f"    ❌ 上传失败")
            time.sleep(1)
        
        if not file_ids:
            print(f"  跳过: 没有成功上传的文件")
            results.append({"name": name, "status": "upload_failed", "file_count": len(files)})
            continue
        
        # 创建合并任务
        print(f"  创建合并任务 ({len(file_ids)} 个文件)...")
        job_id = create_merge_job(token, file_ids)
        if not job_id:
            print(f"  ❌ 任务创建失败")
            results.append({"name": name, "status": "create_failed", "file_count": len(files)})
            continue
        
        print(f"  ✅ 任务: {job_id}")
        
        # 等待完成
        print(f"  等待任务完成...")
        max_wait = 300  # 5分钟
        elapsed = 0
        final_status = None
        while elapsed < max_wait:
            time.sleep(15)
            elapsed += 15
            status, error = check_job(token, job_id)
            print(f"    {elapsed}s: {status}")
            
            if status in ['completed', 'partial_completed', 'needs_review', 'failed']:
                final_status = status
                break
        
        # 获取结果
        result_data = None
        if final_status and final_status != 'failed':
            result_data = get_result(token, job_id)
        
        recognized = 0
        total = 0
        fields = []
        if result_data:
            fields = result_data.get('fields', [])
            total = len(fields)
            recognized = sum(1 for f in fields if f.get('value') and str(f['value']).strip() and str(f['value']) != 'unknown')
        
        results.append({
            "name": name,
            "jobId": job_id,
            "status": final_status or 'timeout',
            "file_count": len(files),
            "uploaded_count": len(file_ids),
            "recognized_fields": recognized,
            "total_fields": total,
            "fields": fields,
            "error": error if final_status == 'failed' else None
        })
        
        print(f"  结果: {final_status} - 识别 {recognized}/{total} 字段")
        time.sleep(5)
    
    # 保存结果
    with open("/tmp/mra_merge_results.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n=== 合并任务测试完成 ===")
    for r in results:
        print(f"  {r['name']}: {r['status']} ({r['file_count']}文件, {r.get('recognized_fields', '-')}/{r.get('total_fields', '-')}字段)")

if __name__ == "__main__":
    main()
