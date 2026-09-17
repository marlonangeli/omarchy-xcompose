# Changelog

## 0.3.1

- Preserve persisted entry IDs, full metadata names, mixed-whitespace previews, and description search when `@name` is present.
- Report malformed configuration sections, oversized configuration files, include failures, and non-conflict diagnostics accurately.
- Watch included files for live reloads while preserving selected symlink paths.
- Harden bounded reads with pre-open and descriptor-based root checks while retaining file, byte, and cycle limits.
- Use unique sensitive staging files in an enforced-`0700` directory and reject symlink file arguments.
- Require `wl-paste` in diagnostics and fail validation for every error-severity parser or bundle diagnostic.
- Run CI on pull requests targeting `main` and pushes to `main`, avoiding duplicate feature-branch push runs.
- Tag merged releases automatically from `manifest.json.version` after CI succeeds on the exact `main` commit.

## 0.3.0

- Add an optional configuration file at `~/.config/omarchy-xcompose/config.json` with source paths, named sources, include roots, search behaviour, UI toggles, clipboard clearing, and path policy.
- Add XCompose comment metadata: `@name`, `@tags`, `@alias`, and `@sensitive`, searchable by alias and by `#tag`.
- Mask sensitive values in the list and preview, reveal with `Ctrl+R`, and insert them through a `0600` file so they never appear in process arguments.
- Add opt-in `include` support with configured roots, a 16-file/1 MiB budget, cycle detection, and `%L` skipping.
- Add a diagnostics pane (`Ctrl+D`) covering parse, configuration, and include problems.
- Restrict summon payload paths to `$HOME`, XDG directories, and `$TMPDIR` by default.
- Follow symlinked XCompose files after `realpath` validation; still reject FIFOs, devices, and loops.
- Extract `BoundedFileReader.qml`, `XComposeConfig.js`, and `XComposeViewModel.js`; the QML layer now only handles interaction, watching, and insertion.
- Cut redundant matching on every keystroke, speed up entry IDs and normalization, and add staged benchmarks, fixtures, a lint script, and CI.
- Add `examples/demo.XCompose` and `scripts/demo` for one-command validation and interactive testing.
- Fix configured and environment sources outside payload roots, config-aware include validation, and `doctor` source precedence.
- Fix option-like literal results, selected-only sensitive reveal, fail-closed secret staging and cleanup, and stale-clipboard insertion races.

## 0.2.1

- Prevent prototype-named XCompose results from crashing result grouping.
- Bound XCompose source, parsed-rule, result, history, and favorites processing.
- Refuse keybind install or removal when managed markers are malformed or duplicated.

## 0.2.0

- Add grouped output variants, deterministic search, match highlighting, complete keyboard navigation, and local opaque usage history.
- Add a wrapped, scrollable full preview for long and multiline selected results.
- Move keyboard help into a compact two-line footer with selection and diagnostic status.
- Harden XCompose parsing with diagnostics, Unicode escapes, duplicate detection, and missing-file recovery.
- Add duplicate/conflict checks to `scripts/doctor`, benchmark tooling, CI, security documentation, and expanded test coverage.

## 0.1.0

- Initial XCompose picker for Omarchy.
