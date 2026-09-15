#!/usr/bin/env bash

set -euo pipefail

value=""
source_file=""
clear_after="1"

while (( $# > 0 )); do
  case "$1" in
    --file)
      shift
      source_file="${1:-}"
      if [[ -z "$source_file" ]]; then
        printf 'omarchy-xcompose: --file requires a path\n' >&2
        exit 2
      fi
      ;;
    --clear)
      shift
      clear_after="${1:-1}"
      ;;
    --)
      shift
      value="${1:-}"
      ;;
    *)
      value="$1"
      ;;
  esac
  shift
done

[[ -n "$value" || -n "$source_file" ]] || exit 0
[[ -z "$source_file" || -f "$source_file" ]] || exit 0

command -v wl-copy >/dev/null 2>&1 || { printf 'omarchy-xcompose: wl-copy is required\n' >&2; exit 127; }
command -v wtype >/dev/null 2>&1 || { printf 'omarchy-xcompose: wtype is required\n' >&2; exit 127; }

copy_pid=""

cleanup() {
  if [[ -n "$copy_pid" ]]; then
    kill "$copy_pid" 2>/dev/null || true
  fi
  if [[ -n "$source_file" ]]; then
    rm -f -- "$source_file"
  fi
}

trap cleanup EXIT

emit_value() {
  if [[ -n "$source_file" ]]; then
    cat -- "$source_file"
  else
    printf '%s' "$value"
  fi
}

if [[ "$clear_after" == "1" ]]; then
  emit_value | wl-copy --type text/plain --sensitive --foreground &
  copy_pid=$!
else
  emit_value | wl-copy --type text/plain --sensitive
fi

wait_for_clipboard() {
  local attempt
  for (( attempt = 0; attempt < 50; attempt++ )); do
    if [[ -n "$(wl-paste --list-types 2>/dev/null || true)" ]]; then
      return 0
    fi
    sleep 0.02
  done
  return 1
}

if command -v wl-paste >/dev/null 2>&1; then
  wait_for_clipboard || true
else
  sleep 0.15
fi

wtype -M shift -k Insert -m shift
sleep 0.2
