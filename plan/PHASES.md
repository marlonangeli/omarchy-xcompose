# Implementation phases

Legend: `[ ]` pending · `[~]` in progress · `[x]` done

## Phase 0 — Base refactor + performance (no behaviour change)

- [x] `BoundedFileReader.qml`: wraps `Process` + `StdioCollector` + `pending` +
  exit codes; API `read(path, limit, args)`, signals `loaded` / `failed`.
- [x] Migrate `composeRead`, `favoritesRead`, `historyRead` (and `configRead`) to
  the component.
- [x] QML uses `XComposeParser.maxSourceBytes` / `XComposeHistory.maxStateBytes`.
- [x] `search()` returns `descriptionRanges`/`resultRanges`/`sequenceRanges`;
  `rebuildDisplay` reuses them and only recomputes when the displayed variant
  differs from the active one.
- [x] Single-pass search (`variantsByResult` + `candidateByResult`).
- [x] Segment-based `highlightMarkup()` (moved to `XComposeViewModel.js`).
- [x] Parity test for `normalize()` parser × search and for limits across modules.
- [x] Extra: `opaqueId` without `Math.imul` (10x), ASCII fast path in
  `normalize`, single-pass `compactPreview` — `parse 1k` from ~30 ms to ~19 ms.

## Phase 1 — Configuration

- [x] `XComposeConfig.js`: defaults, `parse(raw)` with key/type allowlist,
  64 KiB cap, schema version, lists capped at 32 items.
- [x] Config at `$XDG_CONFIG_HOME/omarchy-xcompose/config.json` (override
  `XCOMPOSE_PICKER_CONFIG`), bounded read and watcher.
- [x] Precedence: payload `path` > payload `source` > `compose.path` >
  `$XCOMPOSEFILE` > `~/.XCompose`.
- [x] Named sources (`compose.sources`).
- [x] `config-error` diagnostic in the footer, diagnostics pane (`Ctrl+D`), and
  empty state.
- [x] Keys: `search.fuzzy`, `search.maxResults`, `ui.*`, `includes.*`,
  `insert.clearClipboardAfterPaste`, `security.*`.
- [x] `scripts/doctor` validates the config and `validate-compose.js` accepts
  `--config`.
- [x] Tests for defaults, precedence, unknown keys, wrong types, ranges, caps.

## Phase 2 — Metadata, search, and UI

- [x] `@name`, `@tags`, `@alias`/`@aliases`, `@sensitive` directives with
  per-comment-block inheritance, inline-comment precedence, and blank-line reset.
- [x] Caps and dedupe (8 tags, 8 aliases, 64 chars, 120-char name) plus warnings
  for unknown directives and limits.
- [x] Aliases weighted above description; tags indexed; exact `#tag` filter.
- [x] Sensitive: `(sensitive)` fallback, `󰌾 ••••••` mask in the row and preview,
  session reveal with `Ctrl+R`.
- [x] UI: tags in the row, variant position `n/N`, preview with
  name/tags/aliases/file:line/source, diagnostics pane (`Ctrl+D`), config error
  states.
- [x] Pure `XComposeViewModel.js` (highlight, mask, rows, metadata) with tests.

## Phase 3 — Imports (`include`)

- [x] Shared `scripts/read-safe.js` (realpath, regular file, caps).
- [x] `scripts/read-compose.js`: recursion with 16 files / 1 MiB, realpath cycle
  detection, configurable roots, `%L` skipped, JSON bundle with `state`.
- [x] `XComposeParser.parseBundle()` with cross-file conflict detection and a
  global entry cap.
- [x] Config `includes.enabled` (default `false`) and `includes.roots`.
- [x] Preview shows the source file; `doctor`/`validate-compose` validate
  includes when enabled.
- [x] Tests: recursion, cycle, cap, missing, `%L`, symlink, roots, traversal.

## Phase 4 — Hardening

- [x] `security.allowedRoots` + `allowExternalPaths` applied to the payload in
  QML and, over the resolved path, in `read-compose.js`.
- [x] `read-bounded.js` follows symlinks via realpath + fstat; FIFO/device/socket
  and loops remain rejected.
- [x] Sensitive values written to `$XDG_RUNTIME_DIR/xcompose/` (0700) and passed
  through `--file`; `insert.sh`/`copy.sh` delete the file after use.
- [x] `insert.sh` waits until `wl-paste` returns the requested bytes and clears
  the clipboard only when `insert.clearClipboardAfterPaste` is enabled.
- [x] Adversarial tests: traversal, cycle, FIFO/symlink, malformed config,
  markup in tags/aliases, parser fuzz.
- [x] Updated `SECURITY.md`.

## Phase 5 — Bench + quality

- [x] `bench/generate.js` creates fixtures (100/1k/10k, unicode, comments,
  duplicates, invalid, includes); the 10k one is git-ignored.
- [x] `bench/benchmark.js` measures read→parse→index→query with p50/p95 and
  budgets; `bench/run [--stress]`.
- [x] `docs/benchmarks.md` with environment, table, and optimization history.
- [x] `scripts/lint` (node --check, bash -n, qmllint when available).
- [x] `.github/workflows/ci.yml` with tests, lint, and benchmark smoke test.

## Phase 6 — Docs and release

- [x] `README.md`, `docs/configuration.md`, `docs/xcompose.md`,
  `docs/architecture.md`, `docs/troubleshooting.md`, `SECURITY.md`,
  `CHANGELOG.md`.
- [x] `manifest.json` bumped to `0.3.0`.
- [x] New `docs/benchmarks.md`.
