# Changelog

## 0.3.0

- Add an optional configuration file at `~/.config/omarchy-xcompose/config.json` with source paths, named sources, include roots, search behaviour, UI toggles, clipboard clearing, and path policy.
- Add XCompose comment metadata: `@name`, `@tags`, `@alias`, and `@sensitive`, searchable by alias and by `#tag`.
- Mask sensitive values in the list and preview, reveal with `Ctrl+R`, and insert them through a `0600` file so they never appear in process arguments.
- Add opt-in `include` support with configured roots, a 16-file/1 MiB budget, cycle detection, and `%L` skipping.
- Add a diagnostics pane (`Ctrl+D`) covering parse, configuration, and include problems.
- Restrict summon payload paths to `$HOME`, XDG directories, and `$TMPDIR` by default.
- Follow symlinked XCompose files after `realpath` validation; still reject FIFOs, devices, and loops.
- Extract `BoundedFileReader.qml`, `XComposeConfig.js`, and `XComposeViewModel.js`; the QML layer now only handles interaction, watching, and insertion.
- Cut redundant matching on every keystroke, speed up entry IDs and normalization (~30% faster parse), and add staged benchmarks, fixtures, a lint script, and CI.

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
