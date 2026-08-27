#!/usr/bin/bash

set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p "$test_root/bin" "$test_root/home/.config/hypr"
printf '%s\n' '<Multi_key> <r> <r> : "→"' >"$test_root/home/.XCompose"
printf '%s\n' '-- omarchy-xcompose:start' >"$test_root/home/.config/hypr/bindings.lua"
ln -s /usr/bin/dirname "$test_root/bin/dirname"
ln -s /usr/bin/grep "$test_root/bin/grep"
ln -s "$(command -v node)" "$test_root/bin/node"

for command_name in omarchy omarchy-shell wl-copy wtype; do
cat >"$test_root/bin/$command_name" <<'EOF'
#!/usr/bin/bash
if [[ "${1:-}" == "plugin" && "${2:-}" == "list" ]]; then printf '[{"id":"dev.ilegna.xcompose"}]\n'; fi
exit 0
EOF
  chmod +x "$test_root/bin/$command_name"
done

if ! env HOME="$test_root/home" XDG_CONFIG_HOME="$test_root/home/.config" XCOMPOSEFILE="$test_root/home/.XCompose" PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/doctor" >"$test_root/output"; then
  cat "$test_root/output" >&2
  exit 1
fi
grep -Fq 'ok: plugin manifest is valid' "$test_root/output"
grep -Fq 'ok: one managed keybind block is installed' "$test_root/output"
grep -Fq 'ok: no duplicate or conflicting XCompose sequences' "$test_root/output"

printf '%s\n' '<Multi_key> <r> <r> : "→"' '<Multi_key> <r> <r> : "→"' >"$test_root/home/.XCompose"
env HOME="$test_root/home" XDG_CONFIG_HOME="$test_root/home/.config" XCOMPOSEFILE="$test_root/home/.XCompose" PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/doctor" >"$test_root/output"
grep -Fq 'warning: line 2: Duplicate compose sequence first defined on line 1' "$test_root/output"

printf '%s\n' '<Multi_key> <r> <r> : "→"' '<Multi_key> <r> <r> : "different"' >"$test_root/home/.XCompose"
if env HOME="$test_root/home" XDG_CONFIG_HOME="$test_root/home/.config" XCOMPOSEFILE="$test_root/home/.XCompose" PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/doctor" >"$test_root/output"; then
  printf 'doctor should fail for conflicting XCompose sequences\n' >&2
  exit 1
fi
grep -Fq 'error: line 2: Compose sequence conflicts with line 1' "$test_root/output"

printf '%s\n' '<Multi_key> <r> <r> : "→"' >"$test_root/home/.XCompose"

rm "$test_root/bin/wtype"
if env HOME="$test_root/home" XDG_CONFIG_HOME="$test_root/home/.config" XCOMPOSEFILE="$test_root/home/.XCompose" PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/doctor" >/dev/null 2>&1; then
  printf 'doctor should fail when wtype is absent\n' >&2
  exit 1
fi

printf 'doctor tests passed\n'
