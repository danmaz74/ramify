#!/usr/bin/env bash
# Copied verbatim from cucumber-viz 0.7.0, scripts/run-command-with-cleanup.sh.
# Same author; licensed here under GPL-3.0 with ramify-agent. Reference copy: Plan 3 places it in the harness.

set -uo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 2
fi

CHILD_PID=""
KILL_MODE="single"

cleanup_child() {
  local pid="${1:-}"
  if [ -z "$pid" ]; then
    return
  fi

  if [ "$KILL_MODE" = "group" ]; then
    kill -TERM -- "-$pid" 2>/dev/null || true
    sleep 0.2
    kill -KILL -- "-$pid" 2>/dev/null || true
    return
  fi

  kill -TERM "$pid" 2>/dev/null || true
  sleep 0.2
  kill -KILL "$pid" 2>/dev/null || true
}

handle_signal() {
  cleanup_child "$CHILD_PID"
  wait "$CHILD_PID" 2>/dev/null || true
  exit 143
}

trap handle_signal TERM INT

if command -v setsid >/dev/null 2>&1; then
  KILL_MODE="group"
  setsid "$@" &
else
  "$@" &
fi
CHILD_PID=$!

wait "$CHILD_PID"
EXIT_CODE=$?

# Some commands exit while leaving descendants behind. Kill the whole process
# group after completion so the caller never gets stuck on leaked children.
cleanup_child "$CHILD_PID"

exit "$EXIT_CODE"
