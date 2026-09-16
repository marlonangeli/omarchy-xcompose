# Troubleshooting

Start with the environment check:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/doctor
```

It verifies the required commands, XCompose readability, plugin manifest and
discovery, managed keybinding, and duplicate or conflicting sequences.

## The latest plugin code is not visible

Ask Omarchy Shell to rescan plugins:

```bash
omarchy-shell shell rescanPlugins
```

If the process still holds stale QML, restart it:

```bash
omarchy restart shell
```

Keep backups outside `~/.config/omarchy/plugins/`. Every directory below that
location is scanned as a plugin candidate, so a backup with the same manifest ID
can shadow the active copy.

## XCompose file not found

The picker reads `$XCOMPOSEFILE` when set, otherwise `~/.XCompose`. Confirm the
resolved file with `scripts/doctor`, or summon a specific path as documented in
[Configuration](configuration.md).

## Duplicate or conflicting sequences

`doctor` prints both the repeated line and the original line. Identical repeated
rules are warnings; one sequence producing different results in the same file is
an error. A later included file may override an earlier sequence; that is a
warning and the later rule is the one the picker inserts. Remove or change one
rule, then rerun `doctor`.

## A result copies but does not insert

Confirm both `wl-copy` and `wtype` are installed and visible to the user session.
Insertion copies the exact result, closes the picker to restore focus, and sends
Shift+Insert. Applications that override that paste shortcut may require copying
with `Ctrl+C` and using their own paste action.

## The keybinding does not open the picker

Check the current binding list and Hyprland errors:

```bash
omarchy menu keybindings --print
hyprctl configerrors
```

Reinstall the managed binding using the commands in
[Configuration](configuration.md). The default is `SUPER + Q`.
