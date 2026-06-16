#!/usr/bin/env python3
import json, base64, urllib.request, os

OCR_URL = "http://10.0.0.16:8866/ocr"
image_dir = "固定测试集共45个样本"
all_images = []
for root, dirs, files in os.walk(image_dir):
    for f in sorted(files):
        if f.lower().endswith(('.png', '.jpg', '.jpeg')):
            # 使用前9个字符作为样本ID（与之前一致）
            sid = f[:9] if len(f) >= 9 else f
            all_images.append((sid, f, os.path.join(root, f)))

print(f"找到 {len(all_images)} 张图片")

all_ocr = {}
for i, (sid, fname, path) in enumerate(all_images):
    print(f"处理 {i+1}/{len(all_images)}: {fname}")
    try:
        with open(path, "rb") as fh:
            img_b64 = base64.b64encode(fh.read()).decode()
        payload = json.dumps({"image_base64": img_b64}).encode()
        req = urllib.request.Request(OCR_URL, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            texts = [r['text'] for r in data.get('results', []) if r.get('text', '').strip()]
            all_ocr[sid] = {"filename": fname, "ocr_texts": texts, "ocr_count": len(texts)}
        # 每5个保存一次（防中断丢失）
        if (i+1) % 5 == 0:
            with open("all_ocr_results.json", "w") as f:
                json.dump(all_ocr, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"  错误: {e}")
        all_ocr[sid] = {"filename": fname, "ocr_texts": [], "error": str(e)}

with open("all_ocr_results.json", "w") as f:
    json.dump(all_ocr, f, ensure_ascii=False, indent=2)

print(f"完成，保存到 all_ocr_results.json，共 {len(all_ocr)} 个样本")