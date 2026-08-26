# omarchy-xcompose

An [Omarchy](https://omarchy.org/) Quattro menu plugin for quickly searching and inserting shortcuts from your XCompose file.

The picker reads `$XCOMPOSEFILE` when it is set and falls back to `~/.XCompose`. It indexes rules declared directly in that file, uses nearby comments as searchable descriptions, and leaves `include` directives unexpanded so system-wide compose tables do not overwhelm your personal entries.

## Requirements

- Omarchy Quattro with shell plugin support
- `wl-clipboard` and `wtype` (included in a standard Omarchy installation)
- A local `~/.XCompose` file, or `XCOMPOSEFILE` pointing to one

## Install

Review third-party plugin code before enabling it. Omarchy plugins run unsandboxed inside the long-running shell process.

```bash
omarchy plugin add https://github.com/marlonangeli/omarchy-xcompose.git --enable
```

Open the picker without a keybind:

```bash
omarchy-shell shell summon dev.ilegna.xcompose '{}'
```

Type to filter, use `Up`/`Down` or `Page Up`/`Page Down` to navigate, press `Enter` to insert, and press `Escape` to clear the query or close the picker.

## XCompose entries

Comments immediately before rules become searchable descriptions. One comment applies to consecutive variants until the next blank line or comment.

```text
# Em dash
<Multi_key> <space> <space> : "—"
<Multi_key> <minus> <minus> : "—"

# Arrow right
<Multi_key> <minus> <greater> : "→"
<Multi_key> <r> <r> : "→"
```

Inline comments also work:

```text
<Multi_key> <c> <o> : "©" # Copyright
```

The menu automatically reloads the file while it is open. The parser supports quoted results plus hexadecimal, octal, newline, tab, carriage-return, quote, and backslash escapes. Long or multiline results are inserted in full, while the menu renders a bounded single-line preview with `↵` markers and uses bounded precomputed search text to keep filtering responsive. It intentionally does not expand `include` directives in version 0.1.0.

## Configure a keybind

Omarchy maps Caps Lock to Compose. To preserve that behavior while using `SUPER + CAPS` for this menu, bind the physical keycode instead of the transformed `Caps_Lock` keysym. On a conventional PC keyboard, Caps Lock is XKB keycode `66`.

First inspect your active bindings and confirm the key is available:

```bash
omarchy menu keybindings --print
```

Then run the reversible helper from the installed plugin:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install
```

This adds a marked block to `~/.config/hypr/bindings.lua`, creates a timestamped backup, reloads Hyprland, and checks `hyprctl configerrors`. If validation fails, it restores the backup. Confirm keycode `66` with `wev` if your keyboard is unusual.

To use another binding:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install "SUPER + CTRL + X"
```

If you deliberately want to replace an existing binding, pass `--replace` after identifying what it currently does:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install --replace "SUPER + code:66"
```

That adds the required `hl.unbind(...)` before the new `o.bind(...)` call. You can also configure the binding manually:

```lua
o.bind(
  "SUPER + code:66",
  "XCompose picker",
  "omarchy-shell shell toggle dev.ilegna.xcompose"
)
```

## Update, disable, and remove

Update the Git-managed plugin:

```bash
omarchy plugin update dev.ilegna.xcompose
```

Disable it without deleting it:

```bash
omarchy plugin disable dev.ilegna.xcompose
```

Remove only the managed keybind:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind uninstall
```

Remove both the managed keybind and plugin with the wrapper:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/uninstall
```

Omarchy deliberately does not run plugin install or uninstall hooks. If you use `omarchy plugin remove dev.ilegna.xcompose` directly, remove the keybind first; after the repository is deleted, its cleanup helper is no longer available. Manually created keybinds are never removed by the helper.

## Development

Validate a checkout before loading it:

```bash
./tests/run
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" XComposeMenu.qml
```

Install a local checkout through the same path users exercise:

```bash
omarchy plugin add "$(pwd)" --enable
```

Summon it with a disposable fixture instead of changing your real XCompose file:

```bash
omarchy-shell shell summon dev.ilegna.xcompose '{"path":"/tmp/test.XCompose"}'
```

## License

[MIT](LICENSE)
