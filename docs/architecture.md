# Architecture

```text
~/.config/omarchy-xcompose/config.json
    ↓ XComposeConfig.js
payload + sources + includes + security
    ↓
scripts/read-compose.js ── scripts/read-safe.js
    ↓ bundle { files, diagnostics, state }
XComposeParser.js
    ↓ Entry[] + diagnostics
XComposeSearch.js + XComposeHistory.js + XComposeFavorites.js
    ↓ grouped results
XComposeViewModel.js
    ↓ display rows (markup, tags, masking)
XComposeMenu.qml
    ↓
scripts/insert.sh → wl-copy + wtype
scripts/copy.sh   → wl-copy
```

`XComposeConfig.js` owns schema validation, defaults, path resolution, source
precedence, and the path policy. It is pure JavaScript and unit-tested without
QML.

`scripts/read-safe.js` is the only code that opens files. It resolves symlinks,
checks path policy before opening and against the held descriptor before reading,
requires a regular file, caps bytes, and rejects FIFOs, devices, and loops.
`scripts/read-compose.js` walks `include` directives with cap, root, and cycle
checks, then emits a JSON bundle; `scripts/read-bounded.js` serves the state
files through the same reader.

`XComposeParser.js` owns XCompose syntax, comment metadata (`@name`, `@tags`,
`@alias`, `@sensitive`), decoded results, source locations, and opaque IDs.
`parseBundle()` merges several files and runs duplicate/conflict detection
across all of them.

`XComposeSearch.js` owns normalization, ranking (result, alias, description,
tag, sequences), grouping by result, variant selection, favorites, and `#tag`
filtering. `XComposeViewModel.js` turns search groups into display rows:
markup, tag suffix, variant position, and sensitive masking. The QML menu keeps
only interaction, file watching, and insertion, so the view logic is testable
in Node.

History and favorites are separate versioned files under the local Omarchy state
directory and contain opaque entry IDs only. Sensitive results are staged only in
a unique `0600` file under an enforced-`0700` `$XDG_RUNTIME_DIR/xcompose/`
directory immediately before insertion;
the scripts remove it on success and failure, and startup removes files left by
terminated processes. A staging failure is fail-closed and never falls back to
argv.
