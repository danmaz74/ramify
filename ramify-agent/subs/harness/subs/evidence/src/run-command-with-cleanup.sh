#!/usr/bin/env bash
# Based on cucumber-viz 0.7.0, scripts/run-command-with-cleanup.sh.
# Same author; licensed here under GPL-3.0 with ramify-agent.
# The start barrier lets the parent durably register the detached group
# before the requested command is allowed to execute.

set -uo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 2
fi

CHILD_PID=""
KILL_MODE="single"

cleanup_child() {
  local pid="${1:-}"
  if [ -z "$pid" ]; then return; fi
  if [ "$KILL_MODE" = "group" ]; then
    kill -TERM -- "-$pid" 2>/dev/null || true
    sleep 0.2
    kill -KILL -- "-$pid" 2>/dev/null || true
  else
    kill -TERM "$pid" 2>/dev/null || true
    sleep 0.2
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

handle_signal() {
  cleanup_child "$CHILD_PID"
  wait "$CHILD_PID" 2>/dev/null || true
  exit 143
}
trap handle_signal TERM INT

if command -v setsid >/dev/null 2>&1; then
  KILL_MODE="group"
  setsid bash -c 'IFS= read -r start || exit 125; [ "$start" = start ] || exit 125; exec "$@"' _ "$@" <&0 &
else
  # Without setsid there is no independently killable group to register.
  bash -c 'IFS= read -r start || exit 125; [ "$start" = start ] || exit 125; exec "$@"' _ "$@" <&0 &
fi
CHILD_PID=$!
if [ "$KILL_MODE" = "group" ]; then
  printf 'RAMIFY_GROUP:%s\n' "$CHILD_PID" >&2
else
  printf 'RAMIFY_GROUP:0\n' >&2
fi

wait "$CHILD_PID"
EXIT_CODE=$?
cleanup_child "$CHILD_PID"
exit "$EXIT_CODE"
