# Configuration

## XCompose source

The picker resolves one personal source in this order:

1. the `path` supplied in the summon payload;
2. `$XCOMPOSEFILE`;
3. `~/.XCompose`.

For a temporary source without changing the environment:

```bash
omarchy-shell shell summon dev.ilegna.xcompose '{"path":"/tmp/example.XCompose"}'
```

Relative paths are resolved from the home directory. Quoted `include` directives
are followed with the same regular-file and size checks as the root source.
`%L` uses `$XLOCALEDIR/compose.dir` when present, otherwise a locale `Compose`
file under `$XLOCALEDIR` or `/usr/share/X11/locale`.

## Keybinding

The default managed binding is `SUPER + Q`:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install
```

Choose another binding with an explicit option:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install \
  --binding "SUPER + CTRL + X"
```

If that key is already assigned, inspect Omarchy's bindings first:

```bash
omarchy menu keybindings --print
```

Then, only when the existing action should be replaced:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind install \
  --replace --binding "SUPER + CTRL + X"
```

The helper owns only the block between its `omarchy-xcompose` markers. Every
change creates a timestamped backup and is rolled back if Hyprland reports a
configuration error.

Remove the managed block without removing the plugin:

```bash
~/.config/omarchy/plugins/dev.ilegna.xcompose/scripts/keybind uninstall
```

## Local state

History and favorites are stored beneath `${XDG_STATE_HOME:-~/.local/state}`:

```text
omarchy/xcompose-history.json
omarchy/xcompose-favorites.json
```

They contain opaque entry identifiers, counts, and timestamps—not descriptions,
results, compose sequences, or telemetry.
