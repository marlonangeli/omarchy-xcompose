#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p "$test_root/home/.config/hypr" "$test_root/bin"
printf '%s\n' '-- existing bindings' >"$test_root/home/.config/hypr/bindings.lua"

test_environment=(
  "HOME=$test_root/home"
  "XDG_CONFIG_HOME=$test_root/home/.config"
  "PATH=$test_root/bin:$PATH"
)

cat >"$test_root/bin/hyprctl" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "configerrors" ]]; then
  printf 'ok\n'
fi
EOF
chmod +x "$test_root/bin/hyprctl"

env "${test_environment[@]}" "$project_dir/scripts/keybind" install
grep -Fq 'o.bind("SUPER + code:66"' "$test_root/home/.config/hypr/bindings.lua"

env "${test_environment[@]}" "$project_dir/scripts/keybind" install --replace "SUPER + CTRL + X"
grep -Fq 'hl.unbind("SUPER + CTRL + X")' "$test_root/home/.config/hypr/bindings.lua"
[[ "$(grep -Fc -- '-- omarchy-xcompose:start' "$test_root/home/.config/hypr/bindings.lua")" == 1 ]]

env "${test_environment[@]}" "$project_dir/scripts/keybind" uninstall
! grep -Fq -- '-- omarchy-xcompose:start' "$test_root/home/.config/hypr/bindings.lua"
grep -Fq -- '-- existing bindings' "$test_root/home/.config/hypr/bindings.lua"
[[ "$(find "$test_root/home/.config/hypr" -maxdepth 1 -type f -name 'bindings.lua.bak.*' | wc -l)" == 3 ]]

printf 'keybind tests passed\n'
