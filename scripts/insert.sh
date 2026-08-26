#!/usr/bin/env bash

set -euo pipefail

value="${1:-}"
[[ -n "$value" ]] || exit 0

copy_pid=""

cleanup() {
  if [[ -n "$copy_pid" ]]; then
    kill "$copy_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT

printf '%s' "$value" | wl-copy --type text/plain --sensitive --foreground &
copy_pid=$!

sleep 0.15
wtype -M shift -k Insert -m shift 2>/dev/null || true
sleep 0.2
