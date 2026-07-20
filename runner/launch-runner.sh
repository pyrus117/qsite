#!/usr/bin/env bash
# Desktop launcher for the Q Youth Blog Studio AI runner.
# Polls the Cloudflare studio API and runs the research→draft→reflect pipeline.
# Keep this window open while you want the pipeline live; Ctrl+C to stop.

# Resolve repo root from this script's real location (runner/ -> repo root)
cd "$(dirname "$(readlink -f "$0")")/.." || { echo "Repo not found"; read -r; exit 1; }

echo "Q Youth AI runner — polling. Keep this window open. Ctrl+C to stop."
echo
python3 runner/runner.py
status=$?

trap '' INT   # a trailing Ctrl+C shouldn't skip the pause below
echo
echo "Runner stopped (exit $status). Press Enter to close this window."
read -r
