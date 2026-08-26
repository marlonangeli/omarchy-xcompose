# XCompose Picker for Omarchy

Search, inspect, and insert shortcuts from your personal XCompose file without leaving Omarchy Shell.

The picker reads `$XCOMPOSEFILE` when set, otherwise `~/.XCompose`. It indexes direct rules only, so system compose tables referenced with `include` never overwhelm personal shortcuts.

## Features

- Search descriptions, output, key names, and compact sequences such as `rr`
- Group all shortcuts that produce the same output
- Cycle variations with `Tab` and `Shift+Tab`
- Live reload while the picker is open
- Local, opaque usage history with no telemetry
- Safe clipboard-and-paste insertion using `wl-copy` and `wtype`
- Configurable, reversible `SUPER + CAPS` keybind helper

## Requirements

- Omarchy Quattro with shell plugin support
- `wl-clipboard` and `wtype`
- `~/.XCompose`, or an `XCOMPOSEFILE` environment variable

## Install

Review third-party plugin code before enabling it: Omarchy plugins run inside the long-running, unsandboxed shell process.

```bash
omarchy plugin add https://github.com/marlonangeli/omarchy-xcompose.git --enable
```

Open it directly before configuring a keybind:

```bash
omarchy-shell shell summon dev.ilegna.xcompose '{}'
```

## Usage

| Key | Action |
| --- | --- |
| Type | Search descriptions, output, or sequences |
| Up / Down | Move selection |
| Home / End | First / last result |
| Page Up / Page Down | Move by one page |
| Tab / Shift+Tab | Cycle shortcuts for the selected output |
| Enter | Insert the selected result |
| Escape | Clear search, then close |

Long or multiline values are inserted in full. The menu keeps a compact, single-line preview so one entry cannot cover another.

## XCompose descriptions

Comments immediately before a rule become its description. An inline comment overrides that inherited description for one rule.

```text
# Arrow right
<Multi_key> <r> <r> : "→"
<Multi_key> <minus> <greater> : "→"

<Multi_key> <c> <o> : "©" # Copyright
```

See [XCompose format](docs/xcompose.md) for supported syntax and diagnostics.

## Configure a keybind

The default is `SUPER + code:66`: the physical Caps Lock key on conventional keyboards. It keeps ordinary Caps Lock Compose behavior intact.

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install
```

Use another binding when necessary:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install "SUPER + CTRL + X"
```

The helper creates a timestamped backup, validates Hyprland, and restores the previous file if validation fails. Use `--replace` only after checking the current keybinding.

## Diagnose and remove

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/doctor
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind uninstall
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/uninstall
```

The uninstall wrapper removes only its marked keybind block before removing the plugin. Manually created bindings are untouched.

## Security and development

The plugin reads one local XCompose file, invokes `wl-copy` and `wtype`, stores only opaque usage identifiers locally, and makes no network requests or telemetry calls. See [SECURITY.md](SECURITY.md).

For architecture, XCompose behavior, benchmarks, and local validation, see [docs/architecture.md](docs/architecture.md) and [docs/xcompose.md](docs/xcompose.md).
