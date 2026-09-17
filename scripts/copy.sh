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
source_fd=""
source_descriptor=""

cleanup() {
  if [[ -n "$source_fd" ]]; then
    if [[ ! -L "$source_file" && -f "$source_file" && "$source_file" -ef "$source_descriptor" ]]; then
      rm -f -- "$source_file"
    fi
    exec {source_fd}<&-
  fi
}

trap cleanup EXIT

if [[ -n "$source_file" ]]; then
  if [[ -L "$source_file" || ! -f "$source_file" ]]; then
    printf 'omarchy-xcompose: --file must be a non-symlink regular file\n' >&2
    exit 2
  fi
  expected_path="$(readlink -f -- "$source_file")"
  lexical_path="$(realpath -sm -- "$source_file")"
  if [[ -z "$expected_path" || "$expected_path" != "$lexical_path" ]]; then
    printf 'omarchy-xcompose: --file must not contain symlink path components\n' >&2
    exit 2
  fi
  exec {source_fd}<"$source_file"
  source_descriptor="/proc/$$/fd/$source_fd"
  if [[ "$(readlink -f -- "$source_descriptor")" != "$expected_path" ]]; then
    printf 'omarchy-xcompose: --file changed while opening\n' >&2
    exit 2
  fi
  chmod 600 -- "$source_descriptor"
fi

command -v wl-copy >/dev/null 2>&1 || {
  printf 'omarchy-xcompose: wl-copy is required\n' >&2
  exit 127
}

# Pass the parsed compose result as stdin, never as shell code. wl-copy forks
# by default and retains the Wayland clipboard selection after this script exits.
# Sensitive values arrive through a 0600 file so they never show up in argv.
if [[ -n "$source_file" ]]; then
  wl-copy --type text/plain --sensitive <"$source_descriptor"
else
  printf '%s' "$value" | wl-copy --type text/plain --sensitive
fi
