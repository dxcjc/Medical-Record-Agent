#!/usr/bin/env bash
set -u
cd /tmp/Medical-Record-Agent || exit 1
LOG="/tmp/Medical-Record-Agent/.codex-medical-ui-global-polish-run.log"
{
  echo "[$(date '+%F %T')] UI 全局修复排队调度启动"
  echo "等待当前医疗项目 Codex 任务结束，避免并发写同一工作区/触发 429。"
} >> "$LOG"

while pgrep -af "codex.*Medical Record Agent.*P1/P2|codex.*p2-session-queue|codex.*SESSION-QUEUE" >/dev/null; do
  echo "[$(date '+%F %T')] 检测到既有 Codex 仍在运行，继续等待..." >> "$LOG"
  sleep 60
done

{
  echo "[$(date '+%F %T')] 既有 Codex 已结束，准备启动 UI 全局修复。"
  git status --short | sed 's/^/[git] /'
} >> "$LOG"

set -a
[ -f ~/.hermes/.env ] && . ~/.hermes/.env
set +a

codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --ephemeral "$(cat .codex-medical-ui-global-polish.md)" < /dev/null >> "$LOG" 2>&1
CODE=$?
echo "[$(date '+%F %T')] UI 全局修复 Codex 退出，状态码=$CODE" >> "$LOG"
exit $CODE
