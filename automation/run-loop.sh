#!/bin/zsh
set -u

REPO_DIR="/Users/leejaehwan/Library/Mobile Documents/com~apple~CloudDocs/handoff-20260618/membase-plugin-mcp"
AUTOMATION_DIR="$REPO_DIR/automation"
STATE_FILE="$AUTOMATION_DIR/state.env"
LOG_FILE="$AUTOMATION_DIR/run-loop.log"
PROMPT_FILE="$AUTOMATION_DIR/codex-prompt.md"
PLIST_PATH="$HOME/Library/LaunchAgents/com.aristo.membase-plugin-mcp-loop.plist"
MAX_RUNS=20
CODEX_BIN="/opt/homebrew/bin/codex"

mkdir -p "$AUTOMATION_DIR"
touch "$LOG_FILE"

count=0
if [ -f "$STATE_FILE" ]; then
  count="$(awk -F= '/^RUN_COUNT=/{print $2}' "$STATE_FILE" | tail -1)"
fi
if ! [[ "$count" =~ '^[0-9]+$' ]]; then
  count=0
fi

if [ "$count" -ge "$MAX_RUNS" ]; then
  {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] max runs reached; unloading LaunchAgent if loaded"
  } >> "$LOG_FILE"
  /bin/launchctl bootout "gui/$UID" "$PLIST_PATH" >/dev/null 2>&1 || true
  exit 0
fi

next=$((count + 1))
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "[$started_at] run $next/$MAX_RUNS starting"
} >> "$LOG_FILE"

if [ ! -x "$CODEX_BIN" ]; then
  echo "[$started_at] codex binary not executable: $CODEX_BIN" >> "$LOG_FILE"
  printf 'RUN_COUNT=%s\nLAST_STATUS=%s\nLAST_RUN_AT=%s\n' "$next" "missing-codex" "$started_at" > "$STATE_FILE"
  exit 1
fi

prompt="$(cat "$PROMPT_FILE")

Scheduled run number: $next of $MAX_RUNS.
"

cd "$REPO_DIR" || exit 1
"$CODEX_BIN" exec \
  --cd "$REPO_DIR" \
  --sandbox workspace-write \
  --ask-for-approval never \
  -m gpt-5.4 \
  "$prompt" >> "$LOG_FILE" 2>&1
exit_status=$?
finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

printf 'RUN_COUNT=%s\nLAST_STATUS=%s\nLAST_RUN_AT=%s\n' "$next" "$exit_status" "$finished_at" > "$STATE_FILE"
{
  echo "[$finished_at] run $next/$MAX_RUNS finished with status $exit_status"
} >> "$LOG_FILE"

if [ "$next" -ge "$MAX_RUNS" ]; then
  {
    echo "[$finished_at] completed scheduled run count; unloading LaunchAgent if loaded"
  } >> "$LOG_FILE"
  /bin/launchctl bootout "gui/$UID" "$PLIST_PATH" >/dev/null 2>&1 || true
fi

exit "$exit_status"
