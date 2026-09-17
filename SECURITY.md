# Security Policy

## Security model

This plugin runs inside the user-owned Omarchy shell process. It is not sandboxed.

What it does:

- reads the selected XCompose file and, only when `includes.enabled` is true,
  the quoted includes it references;
- reads `$XDG_CONFIG_HOME/omarchy-xcompose/config.json` and its named sources;
- writes local history and favorites containing opaque entry identifiers,
  counts, and timestamps;
- invokes `wl-copy` and, for insertion, `wtype` with a fixed Shift+Insert
  sequence;
- invokes `node` for bounded file reads.

What it does not do:

- no network access, telemetry, or external services;
- no `eval` of XCompose contents, descriptions, tags, or aliases;
- no shell interpolation: ordinary results are passed as a delimited argument;
  sensitive results use a `0600` file and never enter a command line or shell
  code;
- no XCompose markup: the UI escapes user text before styled rendering.

## Boundaries

- Only regular files are read. Symlinks are resolved with `realpath`; allowed-root
  policy is checked before opening and against the opened descriptor before any
  bytes are read. FIFOs, devices, sockets, and symlink loops are rejected.
- A 1 MiB source cap, a 5,000-rule cap, and a 4,096-character result cap bound
  memory; history and favorites are capped at 64 KiB and 100 entries.
- Includes are off by default, always skip `%L`/system placeholders, and are
  limited to 16 files, 1 MiB total, and configured roots.
- `{"path": ...}` summon payloads are restricted to `$HOME`, `$XDG_CONFIG_HOME`,
  `$XDG_DATA_HOME`, and `$TMPDIR` plus `security.allowedRoots`, unless
  `security.allowExternalPaths` is enabled. Trusted configured sources and
  `$XCOMPOSEFILE` retain their existing path behavior.
- `@sensitive` results are masked in the UI and inserted through a unique `0600`
  file under the enforced-`0700` `$XDG_RUNTIME_DIR/xcompose/` directory, so they
  do not appear in process argument lists. Only the selected entry can be
  revealed, navigation remasks it, staging failures stop the operation, and the
  file is removed on success or failure. Stale files from terminated processes
  are removed when the staging directory is prepared again.
- Insertion waits until `wl-paste` returns the requested bytes, not merely until
  some clipboard owner exists, before sending Shift+Insert.
- The keybind helper edits only its marked block in
  `~/.config/hypr/bindings.lua`, creates a backup, and restores it when
  Hyprland validation fails.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the repository
owner privately with a minimal reproduction and affected version.
