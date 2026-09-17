# Troubleshooting

Start with the environment check:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/doctor
```

It verifies the required commands, XCompose readability, plugin manifest and
discovery, managed keybinding, configuration, and duplicate or conflicting
sequences. Source resolution follows the picker: `compose.path`, then
`$XCOMPOSEFILE`, then `~/.XCompose`.

To verify the bundled example independently of personal rules:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/demo --validate
```

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

The picker resolves `compose.path` from the configuration, then `$XCOMPOSEFILE`,
then `~/.XCompose`. Confirm the resolved file with `scripts/doctor`, or summon a
specific path as documented in [Configuration](configuration.md).

## Configuration problems

Invalid JSON, an unknown `version`, wrong types, or out-of-range values appear in
the diagnostics pane (`Ctrl+D`) and in the footer count. The picker keeps working
with defaults in that case; fix the file and save it — the picker reloads the
configuration automatically.

A named source that does not exist shows `Unknown compose source: <name>` in the
empty state. Check `compose.sources` in the configuration.

## Includes are not indexed

Includes are off by default. Enable them and, if needed, restrict the roots:

```json
"includes": { "enabled": true, "roots": ["~/.config/xcompose", "/usr/share/omarchy/default/xcompose"] }
```

Then press `Ctrl+D`: skipped `%L` includes, cycles, missing files, and files
outside the roots are listed with their line numbers. There is a hard limit of 16
files and 1 MiB in total.

## Sensitive values are hidden

Entries marked `@sensitive` show `󰌾 ••••••` in the list and preview. Press
`Ctrl+R` to reveal the selected value for the current session. To disable masking
entirely, set `ui.maskSensitive` to `false`.

## A payload path is refused

Summon payloads are restricted to `$HOME`, `$XDG_CONFIG_HOME`, `$XDG_DATA_HOME`,
and `$TMPDIR` by default. Add the directory to `security.allowedRoots`, or set
`security.allowExternalPaths` to `true` if the picker should read anywhere the
user can.

## Duplicate or conflicting sequences

`doctor` prints both the repeated line and the original line. Identical repeated
rules are warnings; one sequence producing different results is an error. Remove
or change one rule, then rerun `doctor`.

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
