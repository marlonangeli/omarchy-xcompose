#!/usr/bin/env bash

set -euo pipefail

value="${1:-}"
[[ -n "$value" ]] || exit 0

command -v wl-copy >/dev/null 2>&1 || {
  printf 'omarchy-xcompose: wl-copy is required\n' >&2
  exit 127
}

# Pass the parsed compose result as stdin, never as shell code. wl-copy forks
# by default and retains the Wayland clipboard selection after this script exits.
printf '%s' "$value" | wl-copy --type text/plain --sensitive
