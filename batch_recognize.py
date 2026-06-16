#!/usr/bin/env python3
"""批量识别测试 - 每次2个任务，避免限流"""
import json, base64, os, time, subprocess, sys

# 直接设置环境变量
os.environ['DATABASE_URL'] = 'postgresql://postgres:postgres@localhost:5432/medical_record_agent'
os.environ['JWT_SECRET'] = 'medical-dev-jwt-secret-20260612-secure-key'

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
    return result.stdout.strip()

# 生成token
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

# 上传文件并创建任务
def create_job(token, image_path):
    filename = os.path.basename(image_path)
    
    # 读取图片为base64
    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()
    
    # 上传文件
    file_payload = json.dumps({
        "originalName": filename,
        "mimeType": "image/png",
        "contentBase64": img_b64
    })
    
    tmp_file = f"/tmp/mra_upload_{filename}.json"
    with open(tmp_file, "w") as f:
        f.write(file_payload)
    
    file_result = run_cmd(f"""curl -s http://localhost:3000/files -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer {token}" \
      -d @{tmp_file}""")
    
    try:
        file_resp = json.loads(file_result)
        file_id = file_resp.get('id')
        if not file_id:
            return None, f"文件上传失败: {file_result[:100]}"
    except:
        return None, f"文件上传解析失败: {file_result[:100]}"
    
    # 创建任务
    job_payload = json.dumps({
        "schemaKey": "general-medical-record",
        "sourceFileId": file_id
    })
    
    job_result = run_cmd(f"""curl -s http://localhost:3000/jobs -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer {token}" \
      -d '{job_payload}'""")
    
    try:
        job_resp = json.loads(job_result)
        job_id = job_resp.get('id')
        if job_id:
            return job_id, None
        return None, f"任务创建失败: {job_result[:100]}"
    except:
        return None, f"任务创建解析失败: {job_result[:100]}"

# 检查任务状态
def check_job_status(token, job_id):
    result = run_cmd(f"""curl -s "http://localhost:3000/jobs/{job_id}" -H "Authorization: Bearer {token}" """)
    try:
        data = json.loads(result)
        return data.get('status', 'unknown'), data.get('error', {})
    except:
        return 'error', {}

# 获取识别结果
def get_job_result(token, job_id):
    result = run_cmd(f"""curl -s "http://localhost:3000/results/{job_id}" -H "Authorization: Bearer {token}" """)
    try:
        return json.loads(result)
    except:
        return None

# 主流程
def main():
    # 获取所有测试图片
    image_dir = "/tmp/Medical-Record-Agent/固定测试集共45个样本"
    all_images = []
    for root, dirs, files in os.walk(image_dir):
        for f in sorted(files):
            if f.lower().endswith(('.png', '.jpg', '.jpeg')):
                all_images.append(os.path.join(root, f))
    
    print(f"找到 {len(all_images)} 张测试图片")
    
    # 获取token
    token = get_token()
    if not token:
        print("获取token失败")
        return
    print(f"Token获取成功: {token[:20]}...")
    
    # 结果文件
    results_file = "/tmp/mra_batch_results.json"
    
    # 加载已有结果（断点续传）
    existing_results = {}
    if os.path.exists(results_file):
        with open(results_file) as f:
            existing_results = {r['image']: r for r in json.load(f)}
    
    # 需要处理的图片
    pending_images = [img for img in all_images if img not in existing_results]
    print(f"待处理: {len(pending_images)} 张 (已完成: {len(existing_results)} 张)")
    
    # 分批处理，每次2个
    batch_size = 2
    all_results = list(existing_results.values())
    
    for i in range(0, len(pending_images), batch_size):
        batch = pending_images[i:i+batch_size]
        print(f"\n--- 批次 {i//batch_size + 1}: 处理 {len(batch)} 张 ---")
        
        # 创建任务
        batch_jobs = []
        for img_path in batch:
            filename = os.path.basename(img_path)
            print(f"  上传: {filename}")
            job_id, error = create_job(token, img_path)
            if job_id:
                batch_jobs.append({'image': img_path, 'jobId': job_id, 'filename': filename})
                print(f"    ✅ 任务: {job_id}")
            else:
                print(f"    ❌ 失败: {error}")
                all_results.append({
                    'image': img_path,
                    'filename': filename,
                    'status': 'create_failed',
                    'error': error
                })
            time.sleep(1)  # 间隔1秒
        
        # 等待这批任务完成
        if batch_jobs:
            print(f"  等待 {len(batch_jobs)} 个任务完成...")
            max_wait = 180  # 最多等3分钟
            elapsed = 0
            while elapsed < max_wait:
                time.sleep(10)
                elapsed += 10
                
                all_done = True
                for job in batch_jobs:
                    if 'result' not in job:
                        status, error = check_job_status(token, job['jobId'])
                        if status in ['completed', 'partial_completed', 'needs_review', 'failed']:
                            job['status'] = status
                            if status == 'failed':
                                job['error'] = error
                            else:
                                # 获取识别结果
                                result = get_job_result(token, job['jobId'])
                                if result:
                                    fields = result.get('fields', [])
                                    recognized = sum(1 for f in fields if f.get('value') and str(f['value']).strip() and str(f['value']) != 'unknown')
                                    job['recognized_fields'] = recognized
                                    job['total_fields'] = len(fields)
                                    job['fields'] = fields
                            job['result'] = True
                        else:
                            all_done = False
                
                done_count = sum(1 for j in batch_jobs if 'result' in j)
                print(f"    进度: {done_count}/{len(batch_jobs)} ({elapsed}s)")
                if all_done:
                    break
            
            # 保存结果
            for job in batch_jobs:
                all_results.append({
                    'image': job['image'],
                    'filename': job['filename'],
                    'jobId': job['jobId'],
                    'status': job.get('status', 'timeout'),
                    'recognized_fields': job.get('recognized_fields', 0),
                    'total_fields': job.get('total_fields', 0),
                    'fields': job.get('fields', []),
                    'error': job.get('error')
                })
        
        # 保存中间结果
        with open(results_file, "w") as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)
        
        print(f"  已保存 {len(all_results)} 个结果")
        
        # 批次间隔，避免限流
        if i + batch_size < len(pending_images):
            print("  等待5秒后继续下一批...")
            time.sleep(5)
    
    print(f"\n=== 全部完成: {len(all_results)} 张图片 ===")

if __name__ == "__main__":
    main()
