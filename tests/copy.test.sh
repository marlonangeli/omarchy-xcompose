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
ln -s /usr/bin/rm "$test_root/bin/rm"
ln -s /usr/bin/chmod "$test_root/bin/chmod"
ln -s /usr/bin/readlink "$test_root/bin/readlink"
ln -s /usr/bin/realpath "$test_root/bin/realpath"

TEST_COPY_ARGS="$test_root/args" TEST_COPY_VALUE="$test_root/value" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/copy.sh" 'line one
line two; $(never-run)'

grep -Fx -- '--type text/plain --sensitive' "$test_root/args"
printf 'line one\nline two; $(never-run)' >"$test_root/expected"
cmp "$test_root/expected" "$test_root/value"

secret="$test_root/secret"
printf '%s' 'value from file; $(never-run)' >"$secret"
chmod 600 "$secret"
TEST_COPY_ARGS="$test_root/args-file" TEST_COPY_VALUE="$test_root/value-file" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/copy.sh" --file "$secret"
grep -Fx -- '--type text/plain --sensitive' "$test_root/args-file"
printf '%s' 'value from file; $(never-run)' >"$test_root/expected-file"
cmp "$test_root/expected-file" "$test_root/value-file"
[[ ! -e "$secret" ]] || { printf 'copy did not remove the secret file\n' >&2; exit 1; }

target="$test_root/symlink-target"
link="$test_root/symlink-secret"
printf '%s' 'must remain untouched' >"$target"
chmod 644 "$target"
ln -s "$target" "$link"
rm -f "$test_root/args-symlink" "$test_root/value-symlink"
if TEST_COPY_ARGS="$test_root/args-symlink" TEST_COPY_VALUE="$test_root/value-symlink" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/copy.sh" --file "$link" >/dev/null 2>&1; then
  printf 'copy should reject a symlink source file\n' >&2
  exit 1
fi
[[ -L "$link" && "$(stat -c %a "$target")" == "644" ]] || { printf 'copy modified the symlink target\n' >&2; exit 1; }
[[ "$(cat "$target")" == 'must remain untouched' && ! -e "$test_root/args-symlink" ]] || { printf 'copy read the symlink target\n' >&2; exit 1; }

mkdir "$test_root/actual-dir"
printf '%s' 'parent link target' >"$test_root/actual-dir/secret"
ln -s "$test_root/actual-dir" "$test_root/link-dir"
if TEST_COPY_ARGS="$test_root/args-parent-link" TEST_COPY_VALUE="$test_root/value-parent-link" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/copy.sh" --file "$test_root/link-dir/secret" >/dev/null 2>&1; then
  printf 'copy should reject symlink path components\n' >&2
  exit 1
fi
[[ "$(cat "$test_root/actual-dir/secret")" == 'parent link target' && ! -e "$test_root/args-parent-link" ]] || { printf 'copy read a parent symlink target\n' >&2; exit 1; }

TEST_COPY_ARGS="$test_root/args-option" TEST_COPY_VALUE="$test_root/value-option" PATH="$test_root/bin:$PATH" \
  /usr/bin/bash "$project_dir/scripts/copy.sh" -- --file
printf '%s' '--file' >"$test_root/expected-option"
cmp "$test_root/expected-option" "$test_root/value-option"

if PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/copy.sh" --file >/dev/null 2>&1; then
  printf 'copy should fail when --file has no value\n' >&2
  exit 1
fi

secret="$test_root/secret-missing-copy"
printf '%s' 'must be removed' >"$secret"
rm "$test_root/bin/wl-copy"
if PATH="$test_root/bin" /usr/bin/bash "$project_dir/scripts/copy.sh" --file "$secret" >/dev/null 2>&1; then
  printf 'copy should fail without wl-copy\n' >&2
  exit 1
fi
[[ ! -e "$secret" ]] || { printf 'copy left the secret file after dependency failure\n' >&2; exit 1; }

printf 'copy tests passed\n'
