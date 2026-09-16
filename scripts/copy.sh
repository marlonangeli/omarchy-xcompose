#!/usr/bin/env bash

set -euo pipefail

value=""
source_file=""

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
    --)
      shift
      value="${1:-}"
      break
      ;;
    *)
      value="$1"
      ;;
  esac
  shift
done

[[ -n "$value" || -n "$source_file" ]] || exit 0
[[ -z "$source_file" || -f "$source_file" ]] || exit 0

cleanup() {
  if [[ -n "$source_file" ]]; then
    rm -f -- "$source_file"
  fi
}

trap cleanup EXIT

if [[ -n "$source_file" ]]; then
  chmod 600 -- "$source_file"
fi

command -v wl-copy >/dev/null 2>&1 || {
  printf 'omarchy-xcompose: wl-copy is required\n' >&2
  exit 127
}

# Pass the parsed compose result as stdin, never as shell code. wl-copy forks
# by default and retains the Wayland clipboard selection after this script exits.
# Sensitive values arrive through a 0600 file so they never show up in argv.
if [[ -n "$source_file" ]]; then
  wl-copy --type text/plain --sensitive <"$source_file"
else
  printf '%s' "$value" | wl-copy --type text/plain --sensitive
fi
