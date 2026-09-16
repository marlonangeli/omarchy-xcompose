# Changelog

## 0.3.0

- Follow quoted XCompose `include` directives, including `%H`, `%L`, and `%S`.
- Index locale and Omarchy default compose tables alongside personal shortcuts.
- Raise the indexed-rule cap so the system Compose file is not truncated.

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
