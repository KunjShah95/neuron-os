#!/bin/bash
# Run calibration comparison in background
# Results go to scripts/calibration-output-YYYY-MM-DD.log

cd "$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="scripts/calibration-output-$(TZ=Asia/Kolkata date +%F).log"

echo "[$(TZ=Asia/Kolkata date)] Starting calibration (background)..." >> "$LOG_FILE"

MODELS="openrouter:meta-llama/llama-3.3-70b-instruct:free:Llama3.3,openrouter:qwen/qwen3-coder:free:QwenCoder,openrouter:google/gemma-4-31b-it:free:Gemma4"

bun run scripts/calibration-compare.ts 2>&1 >> "$LOG_FILE"

echo "[$(TZ=Asia/Kolkata date)] Calibration complete." >> "$LOG_FILE"
