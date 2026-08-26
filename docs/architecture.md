# Architecture

```text
XCompose file
    ↓
XComposeParser.js
    ↓ Entry[] + diagnostics
XComposeSearch.js + XComposeHistory.js
    ↓ grouped display rows
XComposeMenu.qml
    ↓
scripts/insert.sh → wl-copy + wtype
```

The parser owns XCompose syntax, decoded results, source locations, and opaque IDs. The search engine owns normalization, match ranking, grouping, variant selection, and deterministic ordering. The QML menu owns keyboard interaction, file watching, rendering, and invoking insertion.

History is stored under `${XDG_STATE_HOME:-~/.local/state}/omarchy/xcompose-history.json`. It contains only schema version, opaque IDs, use counts, and timestamps; it never stores XCompose output, descriptions, or key sequences.

Direct rules remain the sole data source in v0.2. Include recursion, editor actions, generic snippet providers, and configuration files are intentionally deferred.
