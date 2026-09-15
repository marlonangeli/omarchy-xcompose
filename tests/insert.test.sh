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
cat >"$test_root/bin/wl-paste" <<'EOF'
#!/usr/bin/bash
printf 'text/plain\n'
EOF
cat >"$test_root/bin/wtype" <<'EOF'
#!/usr/bin/bash
printf '%s\n' "$*" >"$TEST_WTYPE_ARGS"
EOF
chmod +x "$test_root/bin/wl-copy" "$test_root/bin/wl-paste" "$test_root/bin/wtype"

TEST_COPY_ARGS="$test_root/args" TEST_COPY_VALUE="$test_root/value" TEST_WTYPE_ARGS="$test_root/wtype" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/insert.sh" 'line one
line two; $(never-run)'

grep -Fx -- '--type text/plain --sensitive --foreground' "$test_root/args"
grep -Fx -- '-M shift -k Insert -m shift' "$test_root/wtype"
printf 'line one\nline two; $(never-run)' >"$test_root/expected"
cmp "$test_root/expected" "$test_root/value"

secret="$test_root/secret"
printf '%s' 'secret from file' >"$secret"
chmod 600 "$secret"
TEST_COPY_ARGS="$test_root/args-file" TEST_COPY_VALUE="$test_root/value-file" TEST_WTYPE_ARGS="$test_root/wtype-file" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/insert.sh" --file "$secret" --clear 0
grep -Fx -- '--type text/plain --sensitive' "$test_root/args-file"
printf '%s' 'secret from file' >"$test_root/expected-file"
cmp "$test_root/expected-file" "$test_root/value-file"
grep -Fx -- '-M shift -k Insert -m shift' "$test_root/wtype-file"
[[ ! -e "$secret" ]] || { printf 'insert did not remove the secret file\n' >&2; exit 1; }

if PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/insert.sh" --file >/dev/null 2>&1; then
  printf 'insert should fail when --file has no value\n' >&2
  exit 1
fi

rm "$test_root/bin/wtype"
if PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/insert.sh" 'x' >/dev/null 2>&1; then
  printf 'insert should fail without wtype\n' >&2
  exit 1
fi

printf 'insert tests passed\n'
