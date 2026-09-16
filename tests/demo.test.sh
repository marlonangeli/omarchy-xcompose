#!/usr/bin/bash

set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p "$test_root/bin" "$test_root/home"
cat >"$test_root/bin/omarchy-shell" <<'EOF'
#!/usr/bin/bash
printf '%s\n' "$@" >"$TEST_DEMO_ARGS"
EOF
chmod +x "$test_root/bin/omarchy-shell"

HOME="$test_root/home" XDG_CONFIG_HOME="$test_root/home/.config" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/demo" --validate >"$test_root/validate-output"
grep -Fq 'ok: no duplicate or conflicting XCompose sequences' "$test_root/validate-output"

TEST_DEMO_ARGS="$test_root/args" HOME="$test_root/home" XDG_CONFIG_HOME="$test_root/home/.config" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/demo" >"$test_root/demo-output"
grep -Fxq 'shell' "$test_root/args"
grep -Fxq 'summon' "$test_root/args"
grep -Fxq 'dev.ilegna.xcompose' "$test_root/args"
grep -Fq 'examples/demo.XCompose' "$test_root/args"

printf 'demo tests passed\n'
