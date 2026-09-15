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
      ;;
    *)
      value="$1"
      ;;
  esac
  shift
done

[[ -n "$value" || -n "$source_file" ]] || exit 0

command -v wl-copy >/dev/null 2>&1 || {
  printf 'omarchy-xcompose: wl-copy is required\n' >&2
  exit 127
}

# Pass the parsed compose result as stdin, never as shell code. wl-copy forks
# by default and retains the Wayland clipboard selection after this script exits.
# Sensitive values arrive through a 0600 file so they never show up in argv.
if [[ -n "$source_file" ]]; then
  [[ -f "$source_file" ]] || exit 0
  wl-copy --type text/plain --sensitive <"$source_file"
  rm -f -- "$source_file"
else
  printf '%s' "$value" | wl-copy --type text/plain --sensitive
fi
