# Architecture

```text
XCompose file + quoted includes
    ↓
scripts/read-compose-tree.js
    ↓ bounded regular files
XComposeParser.js
    ↓ Entry[] + diagnostics
XComposeSearch.js + XComposeHistory.js
    ↓ grouped display rows
XComposeMenu.qml
    ↓
scripts/insert.sh → wl-copy + wtype
scripts/copy.sh   → wl-copy
```

The bounded reader owns regular-file, no-follow checks and byte caps before text reaches QML. The compose-tree walker resolves `%H`, `%L`, and `%S`, follows quoted includes with depth and size caps, and never follows symlinks. The parser owns XCompose syntax, decoded results, source locations, and opaque IDs. The search engine owns normalization, match ranking, grouping, variant selection, favorites, and deterministic ordering. The QML menu owns keyboard interaction, file watching, rendering, and invoking insertion. `copy.sh` receives parsed results over stdin and never evaluates them as shell code. History and favorites are separate versioned files under the local Omarchy state directory and contain opaque entry IDs only.

History is stored under `${XDG_STATE_HOME:-~/.local/state}/omarchy/xcompose-history.json`. It contains only schema version, opaque IDs, use counts, and timestamps; it never stores XCompose output, descriptions, or key sequences.

Quoted include recursion is part of the indexed source. Editor actions, generic snippet providers, and configuration files remain deferred.
