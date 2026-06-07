#!/bin/bash
#
# run-calibration-midnight.sh
#
# Waits until midnight IST (Indian Standard Time, UTC+5:30) then runs
# the calibration comparison with OpenRouter free models.
#
# Output written to: scripts/calibration-output-$(date +%F).log
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$SCRIPT_DIR/calibration-output-$(TZ=Asia/Kolkata date +%F).log"

echo "[$(TZ=Asia/Kolkata date)] Waiting until midnight IST..." | tee -a "$LOG_FILE"

# Calculate seconds until midnight IST (UTC+5:30)
NOW_EPOCH=$(date -u +%s)
MIDNIGHT_EPOCH=$(TZ=Asia/Kolkata date -d "tomorrow 00:00:00" +%s 2>/dev/null || \
  python3 -c "from datetime import datetime, timezone, timedelta; tz = timezone(timedelta(hours=5, minutes=30)); now = datetime.now(tz); tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1); print(int(tomorrow.timestamp()))")

SLEEP_SEC=$((MIDNIGHT_EPOCH - NOW_EPOCH))

if [ "$SLEEP_SEC" -le 0 ]; then
  echo "[$(TZ=Asia/Kolkata date)] Midnight IST already passed, running now." | tee -a "$LOG_FILE"
  SLEEP_SEC=0
fi

echo "[$(TZ=Asia/Kolkata date)] Sleeping for $SLEEP_SEC seconds (~$((SLEEP_SEC / 3600))h $(((SLEEP_SEC % 3600) / 60))m)..." | tee -a "$LOG_FILE"
sleep "$SLEEP_SEC"

echo "[$(TZ=Asia/Kolkata date)] Running calibration comparison..." | tee -a "$LOG_FILE"
echo "" >> "$LOG_FILE"

cd "$PROJECT_DIR"

# Run with OpenRouter free models
MODELS="openrouter:meta-llama/llama-3.3-70b-instruct:free:Llama3.3,openrouter:qwen/qwen3-coder:free:QwenCoder,openrouter:google/gemma-4-31b-it:free:Gemma4" \
  bun run scripts/calibration-compare.ts 2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=$?
echo "" >> "$LOG_FILE"
echo "[$(TZ=Asia/Kolkata date)] Calibration complete. Exit code: $EXIT_CODE" | tee -a "$LOG_FILE"
