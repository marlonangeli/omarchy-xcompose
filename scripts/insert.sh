#!/usr/bin/env bash

set -euo pipefail

value="${1:-}"
[[ -n "$value" ]] || exit 0

command -v wl-copy >/dev/null 2>&1 || { printf 'omarchy-xcompose: wl-copy is required\n' >&2; exit 127; }
command -v wtype >/dev/null 2>&1 || { printf 'omarchy-xcompose: wtype is required\n' >&2; exit 127; }

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
wtype -M shift -k Insert -m shift
sleep 0.2
