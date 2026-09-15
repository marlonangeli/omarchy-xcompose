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
- no shell interpolation: parsed results are passed to stdin or to a `0600`
  file, never into a command line or shell code;
- no XCompose markup: the UI escapes user text before styled rendering.

## Boundaries

- Only regular files are read. Symlinks are resolved with `realpath`, and FIFOs,
  devices, sockets, and symlink loops are rejected.
- A 1 MiB source cap, a 5,000-rule cap, and a 4,096-character result cap bound
  memory; history and favorites are capped at 64 KiB and 100 entries.
- Includes are off by default, always skip `%L`/system placeholders, and are
  limited to 16 files, 1 MiB total, and configured roots.
- `{"path": ...}` summon payloads are restricted to `$HOME`, `$XDG_CONFIG_HOME`,
  `$XDG_DATA_HOME`, and `$TMPDIR` plus `security.allowedRoots`, unless
  `security.allowExternalPaths` is enabled.
- `@sensitive` results are masked in the UI and inserted through a `0600` file
  under `$XDG_RUNTIME_DIR/xcompose/`, so they do not appear in process argument
  lists. The file is removed after use.
- The keybind helper edits only its marked block in
  `~/.config/hypr/bindings.lua`, creates a backup, and restores it when
  Hyprland validation fails.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the repository
owner privately with a minimal reproduction and affected version.
