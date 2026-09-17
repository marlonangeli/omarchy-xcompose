# Configuration

Everything is optional. Without a configuration file the picker keeps the old
behaviour: `$XCOMPOSEFILE`, then `~/.XCompose`, no includes, no payload paths
outside the allowed roots.

## File location

```text
$XDG_CONFIG_HOME/omarchy-xcompose/config.json
```

or `~/.config/omarchy-xcompose/config.json` when `XDG_CONFIG_HOME` is unset.
`XCOMPOSE_PICKER_CONFIG` overrides the path (useful for tests).

Invalid JSON, unknown versions, and wrong types never break the picker: the
problem shows in the diagnostics pane (`Ctrl+D`) and the defaults stay active.

## Schema

```json
{
  "version": 1,
  "compose": {
    "path": "~/.XCompose",
    "sources": [
      { "name": "work", "path": "~/work/.XCompose" }
    ]
  },
  "includes": {
    "enabled": false,
    "roots": ["~/.config/xcompose"]
  },
  "search": { "fuzzy": true, "maxResults": 100 },
  "ui": { "showTags": true, "showSource": true, "showSourceBadge": false, "maskSensitive": true },
  "insert": { "clearClipboardAfterPaste": true },
  "security": { "allowExternalPaths": false, "allowedRoots": [] }
}
```

| Key | Default | Meaning |
|---|---|---|
| `compose.path` | `""` | Preferred XCompose file; empty falls back to `$XCOMPOSEFILE` then `~/.XCompose` |
| `compose.sources` | `[]` | Named files for `{"source": "work"}` payloads |
| `includes.enabled` | `false` | Index `include "file"` directives |
| `includes.roots` | `[]` | Allowed directories for includes; empty defaults to `$HOME` |
| `search.fuzzy` | `true` | Allow subsequence matching after exact/prefix/substring |
| `search.maxResults` | `100` | Rendered groups, 1–500 |
| `ui.showTags` | `true` | Show `#tags` in the result row |
| `ui.showSource` | `true` | Show the source file in the preview pane |
| `ui.showSourceBadge` | `false` | Show the selected source name in the header; Omarchy sets `XCOMPOSEFILE`, so this usually reads `environment` |
| `ui.maskSensitive` | `true` | Mask `@sensitive` results in the list and preview |
| `insert.clearClipboardAfterPaste` | `true` | Drop the clipboard right after paste |
| `security.allowExternalPaths` | `false` | Allow `{"path": ...}` outside the default roots |
| `security.allowedRoots` | `[]` | Extra allowed directories, in addition to `$HOME`, `$XDG_CONFIG_HOME`, `$XDG_DATA_HOME`, `$TMPDIR` |

## Source precedence

1. `{"path": "..."}` in the summon payload (inside the allowed roots by default);
2. `{"source": "name"}` matching `compose.sources`;
3. `compose.path` from the configuration;
4. `$XCOMPOSEFILE`;
5. `~/.XCompose`.

Relative paths resolve from the home directory. `$XCOMPOSEFILE` and `~/.XCompose`
may be symlinks; the picker resolves them and refuses anything that is not a
regular file.

The root policy applies only to untrusted `{"path": ...}` summon payloads.
Configured paths, named sources, and `$XCOMPOSEFILE` remain compatible with
locations outside the default roots, while still requiring a bounded regular
file after resolving symlinks.

## Includes

Includes are off by default so a system `include "%L"` cannot flood the picker
with thousands of rules.

```json
"includes": { "enabled": true, "roots": ["~/.config/xcompose"] }
```

- `include "file"` resolves from the directory of the file that includes it;
- `~/` and absolute paths work;
- `%L` and other system placeholders are always skipped;
- cycles, repeated files, missing files, and paths outside `roots` are reported
  in the diagnostics pane and never loaded;
- at most 16 files and 1 MiB total.

## Sensitive values

Mark entries in the XCompose file:

```text
# Personal password @sensitive
<Multi_key> <space> <p> : "correct horse battery staple"
```

With `ui.maskSensitive` (default), the result is hidden as `󰌾 ••••••` in the row
and in the preview. `Ctrl+R` reveals only the selected value; moving to another
result remasks it.
The value still inserts and copies normally; for sensitive entries it is written
to a `0600` file under `$XDG_RUNTIME_DIR/xcompose/` before the insert script
runs, so it never appears in the process argument list. The file is removed
right after use, including dependency or clipboard failures. If staging the file
fails, the picker stays open and reports the error instead of falling back to
argv.

## Keybinding

The managed binding is `SUPER + Q`:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install --binding "SUPER + CTRL + X"
```

If the key is already taken, inspect Omarchy's bindings first:

```bash
omarchy menu keybindings --print
```

Then, only when the existing action should be replaced:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install \
  --replace --binding "SUPER + CTRL + X"
```

The helper owns only the block between its `omarchy-xcompose` markers. Every
change creates a timestamped backup and is rolled back if Hyprland reports a
configuration error. Remove the block with `scripts/keybind uninstall`.

## Local state

History and favorites live under `${XDG_STATE_HOME:-~/.local/state}/omarchy/`:

```text
xcompose-history.json
xcompose-favorites.json
```

They contain opaque entry identifiers, counts, and timestamps — never
descriptions, results, compose sequences, or telemetry.
