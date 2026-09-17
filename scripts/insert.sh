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
      clear_after="${1:-}"
      if [[ "$clear_after" != "0" && "$clear_after" != "1" ]]; then
        printf 'omarchy-xcompose: --clear requires 0 or 1\n' >&2
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
copy_pid=""
source_fd=""
source_descriptor=""

cleanup() {
  if [[ -n "$copy_pid" ]]; then
    kill "$copy_pid" 2>/dev/null || true
  fi
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

command -v wl-copy >/dev/null 2>&1 || { printf 'omarchy-xcompose: wl-copy is required\n' >&2; exit 127; }
command -v wl-paste >/dev/null 2>&1 || { printf 'omarchy-xcompose: wl-paste is required\n' >&2; exit 127; }
command -v wtype >/dev/null 2>&1 || { printf 'omarchy-xcompose: wtype is required\n' >&2; exit 127; }

emit_value() {
  if [[ -n "$source_file" ]]; then
    cat -- "$source_descriptor"
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
    if cmp -s <(emit_value) <(wl-paste --no-newline --type text/plain 2>/dev/null); then
      return 0
    fi
    sleep 0.02
  done
  return 1
}

wait_for_clipboard || { printf 'omarchy-xcompose: clipboard did not acquire the requested value\n' >&2; exit 1; }

wtype -M shift -k Insert -m shift
sleep 0.2
