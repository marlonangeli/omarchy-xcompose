# omarchy-xcompose v0.3.0 evolution plan

Working document for the iteration covering the performance, maintainability,
and security review plus the requested features: UI, XCompose file location
configuration, imports (`include`), names, tags, search aliases, and sensitive
values.

- Review findings: [REVIEW.md](REVIEW.md)
- Phases, tasks, and acceptance criteria: [PHASES.md](PHASES.md)

Status: all six phases were implemented and verified (`tests/run`,
`scripts/lint`, a real QML smoke test through Quickshell, `bench/run`). Nothing
has been committed yet.

## Decisions

| Topic | Decision |
|---|---|
| Scope | Everything in phases, with tests at each phase |
| Metadata | `@` directives in comments: `# Name @tags: a, b @alias: x, y @sensitive` |
| Config | `$XDG_CONFIG_HOME/omarchy-xcompose/config.json` (fallback `~/.config/omarchy-xcompose/config.json`); override with `XCOMPOSE_PICKER_CONFIG` |
| Imports | Off by default (`includes.enabled=false`); `%L`/system always skipped |
| Sensitive | Mask in list/preview + `Ctrl+R` to reveal; description never derives from the value; insertion through a `0600` file (never argv) |
| Hardening | Restrict payload paths; follow symlinks with `realpath` (regular target + caps); adversarial tests; re-enable CI |

## Compatibility contract

- `$XCOMPOSEFILE` / `~/.XCompose` remain the default when there is no config.
- A `{"path": "..."}` payload is still accepted inside the allowed roots
  (`$HOME`, `$XDG_CONFIG_HOME`, `$XDG_DATA_HOME`, `$TMPDIR` plus
  `security.allowedRoots`).
- `manifest.json` stays minimal (schema fields only).
- State files (history/favorites) remain opaque and versioned.
- No network, no telemetry, no `eval`; XCompose contents are never executed.

## Versioning

- `0.3.0`: new features plus changed default security behaviour (restricted
  paths, followed symlinks) and the sensitive insertion path.

## Verification per phase

```bash
tests/run
qmllint -I "${OMARCHY_PATH:-/usr/share/omarchy}/shell" XComposeMenu.qml
node --check XComposeParser.js XComposeSearch.js XComposeHistory.js XComposeFavorites.js
```
