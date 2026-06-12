# PaddleOCR 适配层任务

## 问题
医疗项目的 HTTP OCR provider 和 PaddleOCR 的 API 格式完全不兼容。

**医疗项目发送格式（httpOcrProvider.ts）：**
```json
POST http://localhost:8866
{
  "documentId": "xxx",
  "fileName": "test.png",
  "mimeType": "image/png",
  "storageKey": "uploads/xxx",
  "contentBase64": "base64..."
}
```

**期望返回格式：**
```json
{
  "pages": [{
    "page": 1,
    "text": "整页文本",
    "confidence": 0.95,
    "blocks": [{
      "blockId": "xxx",
      "text": "文本块",
      "confidence": 0.9,
      "coordinates": {"x": 0, "y": 0, "width": 100, "height": 50}
    }]
  }],
  "qualityWarnings": []
}
```

**PaddleOCR 实际格式：**
接收：POST /ocr/file (multipart) 或 POST /ocr (JSON {image_base64})
返回：
```json
{
  "success": true,
  "results": [
    {"text": "文字", "confidence": 0.95, "bbox": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]}
  ],
  "full_text": "全部文字",
  "language": "ch"
}
```

## 方案
在 `/opt/paddle-ocr/` 下新建一个适配服务 `adapter.py`，跑在端口 8867：

1. 接收医疗项目的请求格式（JSON，端口 8867）
2. 从 contentBase64 或 storageKey 读取文件
3. 转发给 PaddleOCR（POST /ocr/file 到 8866）
4. 把 PaddleOCR 的返回格式转换为医疗项目期望的格式

同时修改 nginx 9001 端口的代理，让 `/api/ocr` 指向适配层 8867。

## 关键文件
- PaddleOCR 服务：/opt/paddle-ocr/server3x.py（端口 8866）
- 医疗 OCR provider：/tmp/Medical-Record-Agent/packages/core/src/providers/httpOcrProvider.ts
- 医疗 .env：/tmp/Medical-Record-Agent/.env（OCR_ENDPOINT）
- nginx 配置：/etc/nginx/sites-available/default（9001 端口）

## 验收标准
1. 适配服务运行在 8867 端口
2. 直接 curl 测试适配服务能正确转换格式
3. 医疗项目创建识别任务，OCR 阶段不再报 HTTP_OCR_NON_RETRYABLE_FAILURE
4. 适配服务的 systemd service 或 supervisord 管理
