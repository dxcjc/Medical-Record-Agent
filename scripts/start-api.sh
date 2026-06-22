#!/bin/bash
cd /tmp/Medical-Record-Agent/apps/api

# 加载 .env 文件
set -a
source /tmp/Medical-Record-Agent/.env
set +a

# 启动 API
exec npx tsx src/index.ts
