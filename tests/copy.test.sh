#!/usr/bin/bash

set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p "$test_root/bin"
cat >"$test_root/bin/wl-copy" <<'EOF'
#!/usr/bin/bash
printf '%s\n' "$*" >"$TEST_COPY_ARGS"
/usr/bin/cat >"$TEST_COPY_VALUE"
EOF
chmod +x "$test_root/bin/wl-copy"

TEST_COPY_ARGS="$test_root/args" TEST_COPY_VALUE="$test_root/value" PATH="$test_root/bin" \
  /usr/bin/bash "$project_dir/scripts/copy.sh" 'line one
line two; $(never-run)'

grep -Fx -- '--type text/plain --sensitive' "$test_root/args"
printf 'line one\nline two; $(never-run)' >"$test_root/expected"
cmp "$test_root/expected" "$test_root/value"

if PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/copy.sh" 'x' >/dev/null 2>&1; then
  printf 'copy should fail without wl-copy\n' >&2
  exit 1
fi

printf 'copy tests passed\n'
