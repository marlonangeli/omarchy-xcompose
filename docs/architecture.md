# Architecture

```text
XCompose file
    ↓
scripts/read-bounded.js
    ↓
XComposeParser.js
    ↓ Entry[] + diagnostics
XComposeSearch.js + XComposeHistory.js
    ↓ grouped display rows
XComposeMenu.qml
    ↓
scripts/insert.sh → wl-copy + wtype
scripts/copy.sh   → wl-copy
```

The bounded reader owns regular-file, no-follow checks and byte caps before text reaches QML. The parser owns XCompose syntax, decoded results, source locations, and opaque IDs. The search engine owns normalization, match ranking, grouping, variant selection, favorites, and deterministic ordering. The QML menu owns keyboard interaction, file watching, rendering, and invoking insertion. `copy.sh` receives parsed results over stdin and never evaluates them as shell code. History and favorites are separate versioned files under the local Omarchy state directory and contain opaque entry IDs only.

History is stored under `${XDG_STATE_HOME:-~/.local/state}/omarchy/xcompose-history.json`. It contains only schema version, opaque IDs, use counts, and timestamps; it never stores XCompose output, descriptions, or key sequences.

Direct rules remain the sole data source in v0.2. Include recursion, editor actions, generic snippet providers, and configuration files are intentionally deferred.
