# Review — findings and fixes

References are against `0.2.1` (commit `d301474`).

## Performance

| # | Finding | Location | Fix |
|---|---|---|---|
| P1 | `rebuildDisplay()` re-ran `matchEntry()` for up to 100 rows on every keystroke even though `search()` already had the ranges | `XComposeMenu.qml:229` | `search()` returns `descriptionRanges`/`resultRanges`/`sequenceRanges` for the active variant; the QML only recomputes when `variantIndex != activeVariantIndex` |
| P2 | `search()` walked `entries` twice (matching + collecting variants) and sorted all groups before the slice | `XComposeSearch.js:216,229` | single pass building `allByResult` and `matchedByResult` together |
| P3 | `compactPreview()` ran ~5 regex passes per field, up to 3-4 fields per entry, on values up to 4 KB | `XComposeParser.js:12,173` | single regex pass with a callback; measured before further changes |
| P4 | `highlightMarkup()` concatenated character by character | `XComposeMenu.qml:103` | build by segments: escape once and wrap only the ranges in `<b><u>` |
| P5 | `bench/benchmark.js` only measured synthetic parse/search, with no fixtures or per-stage numbers | `bench/benchmark.js` | fixtures 100/1k/10k + unicode/comments/duplicates/invalid/includes and staged read→parse→index→query measurement |

## Maintainability

| # | Finding | Location | Fix |
|---|---|---|---|
| M1 | Three identical `Process` + `StdioCollector` blocks with duplicated `pending` logic (~60 lines) | `XComposeMenu.qml:328-383` | `BoundedFileReader.qml` component |
| M2 | Duplicated limits: `1024*1024`/`64*1024` in QML vs `maxSourceLength`/`maxStateLength` in the modules | `XComposeMenu.qml:26,27` | QML references the JS module exports (`maxSourceBytes`, `maxStateBytes`) |
| M3 | `normalize()` duplicated in parser and search, with no parity test | `XComposeParser.js:1`, `XComposeSearch.js:1` | parity test over a string corpus |
| M4 | View-model logic trapped in the QML; `menu.test.js` validated by regex | `XComposeMenu.qml:219`, `tests/menu.test.js` | pure `XComposeViewModel.js` to build display rows (phase 2); fewer regex asserts |
| M5 | No configuration: `open()` had no source precedence or error state | `XComposeMenu.qml:67,75` | `XComposeConfig.js` + config diagnostics (phase 1) |

## Security

| # | Finding | Location | Fix |
|---|---|---|---|
| S1 | `open(payloadJson)` accepted an arbitrary absolute path — any process in the shell could summon the picker and read user files | `XComposeMenu.qml:75` | `realpath` + allowed roots by default; opt out with `security.allowExternalPaths` |
| S2 | `read-bounded.js` rejected symlinks — broke a symlinked `~/.XCompose` (dotfiles) | `scripts/read-bounded.js:20,41` | follow symlinks via `realpath` and validate the target (regular + caps); FIFO/device/socket/loop remain rejected |
| S3 | Inserted values travelled through argv and were visible in `/proc/<pid>/cmdline` | `XComposeMenu.qml:288`, `scripts/insert.sh:5` | sensitive values go through a `0600` file under `$XDG_RUNTIME_DIR`; scripts accept `--file` and delete it after reading |
| S4 | `insert.sh` relied on fixed sleeps (0.15/0.2) and killed `wl-copy --foreground` → focus/clipboard race | `scripts/insert.sh:24,25,26` | wait for clipboard ownership (`wl-paste --list-types`, timeout) and clear only when configured |
| S5 | No adversarial tests (traversal, include cycle, malformed config, markup) | `tests/` | adversarial suite in phase 4 |
| S6 | CI removed (`.github/workflows` empty) | `.github/` | workflow running tests + checks (phase 5) |
