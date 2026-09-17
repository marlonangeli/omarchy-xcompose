#!/usr/bin/bash

set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p "$test_root/bin"
cat >"$test_root/bin/wl-copy" <<'EOF'
#!/usr/bin/bash
printf '%s\n' "$*" >"$TEST_COPY_ARGS"
if [[ -n "${TEST_COPY_DELAY:-}" ]]; then /usr/bin/sleep "$TEST_COPY_DELAY"; fi
/usr/bin/cat >"$TEST_COPY_VALUE"
EOF
cat >"$test_root/bin/wl-paste" <<'EOF'
#!/usr/bin/bash
[[ -f "$TEST_COPY_VALUE" ]] && /usr/bin/cat "$TEST_COPY_VALUE"
EOF
cat >"$test_root/bin/wtype" <<'EOF'
#!/usr/bin/bash
printf '%s\n' "$*" >"$TEST_WTYPE_ARGS"
if [[ -n "${TEST_PASTED_VALUE:-}" && -f "$TEST_COPY_VALUE" ]]; then /usr/bin/cat "$TEST_COPY_VALUE" >"$TEST_PASTED_VALUE"; fi
EOF
chmod +x "$test_root/bin/wl-copy" "$test_root/bin/wl-paste" "$test_root/bin/wtype"
ln -s /usr/bin/rm "$test_root/bin/rm"
ln -s /usr/bin/chmod "$test_root/bin/chmod"
ln -s /usr/bin/readlink "$test_root/bin/readlink"
ln -s /usr/bin/realpath "$test_root/bin/realpath"

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

target="$test_root/symlink-target"
link="$test_root/symlink-secret"
printf '%s' 'must remain untouched' >"$target"
chmod 644 "$target"
ln -s "$target" "$link"
rm -f "$test_root/args-symlink" "$test_root/value-symlink" "$test_root/wtype-symlink"
if TEST_COPY_ARGS="$test_root/args-symlink" TEST_COPY_VALUE="$test_root/value-symlink" TEST_WTYPE_ARGS="$test_root/wtype-symlink" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/insert.sh" --file "$link" >/dev/null 2>&1; then
  printf 'insert should reject a symlink source file\n' >&2
  exit 1
fi
[[ -L "$link" && "$(stat -c %a "$target")" == "644" ]] || { printf 'insert modified the symlink target\n' >&2; exit 1; }
[[ "$(cat "$target")" == 'must remain untouched' && ! -e "$test_root/args-symlink" && ! -e "$test_root/wtype-symlink" ]] || { printf 'insert read the symlink target\n' >&2; exit 1; }

mkdir "$test_root/actual-dir"
printf '%s' 'parent link target' >"$test_root/actual-dir/secret"
ln -s "$test_root/actual-dir" "$test_root/link-dir"
if TEST_COPY_ARGS="$test_root/args-parent-link" TEST_COPY_VALUE="$test_root/value-parent-link" TEST_WTYPE_ARGS="$test_root/wtype-parent-link" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/insert.sh" --file "$test_root/link-dir/secret" >/dev/null 2>&1; then
  printf 'insert should reject symlink path components\n' >&2
  exit 1
fi
[[ "$(cat "$test_root/actual-dir/secret")" == 'parent link target' && ! -e "$test_root/args-parent-link" && ! -e "$test_root/wtype-parent-link" ]] || { printf 'insert read a parent symlink target\n' >&2; exit 1; }

TEST_COPY_ARGS="$test_root/args-option" TEST_COPY_VALUE="$test_root/value-option" TEST_WTYPE_ARGS="$test_root/wtype-option" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/insert.sh" -- --clear
printf '%s' '--clear' >"$test_root/expected-option"
cmp "$test_root/expected-option" "$test_root/value-option"

printf '%s' 'old clipboard' >"$test_root/value-race"
TEST_COPY_ARGS="$test_root/args-race" TEST_COPY_VALUE="$test_root/value-race" TEST_WTYPE_ARGS="$test_root/wtype-race" TEST_PASTED_VALUE="$test_root/pasted-race" TEST_COPY_DELAY=0.1 PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/insert.sh" -- 'new clipboard'
printf '%s' 'new clipboard' >"$test_root/expected-race"
cmp "$test_root/expected-race" "$test_root/pasted-race"

if PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/insert.sh" --file >/dev/null 2>&1; then
  printf 'insert should fail when --file has no value\n' >&2
  exit 1
fi

secret="$test_root/secret-missing-wtype"
printf '%s' 'must be removed' >"$secret"
rm "$test_root/bin/wtype"
if PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/insert.sh" --file "$secret" >/dev/null 2>&1; then
  printf 'insert should fail without wtype\n' >&2
  exit 1
fi
[[ ! -e "$secret" ]] || { printf 'insert left the secret file after dependency failure\n' >&2; exit 1; }

printf 'insert tests passed\n'
