# Security Policy

## Security model

This plugin runs inside the user-owned Omarchy shell process. It is not sandboxed.

It reads the selected `$XCOMPOSEFILE` or `~/.XCompose`, writes a local history file containing only opaque entry identifiers with counts and timestamps, invokes `wl-copy`, and invokes `wtype` with a fixed Shift+Insert sequence. It does not access the network, collect telemetry, execute XCompose contents as shell code, or evaluate descriptions as markup.

The keybind helper edits only its marked block in `~/.config/hypr/bindings.lua`, creates a backup, and restores it when Hyprland validation fails.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the repository owner privately with a minimal reproduction and affected version.
