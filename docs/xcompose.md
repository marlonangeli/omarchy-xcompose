# XCompose format

The picker indexes direct rules from the resolved XCompose file. `include`
directives are ignored unless they are explicitly enabled in the configuration.

## Descriptions

A consecutive comment block describes subsequent rules until a blank line or a
new comment block. An inline comment is more specific and takes precedence.

```text
# Arrow right
# Navigation
<Multi_key> <r> <r> : "→"
<Multi_key> <minus> <greater> : "→"

<Multi_key> <c> <o> : "©" # Copyright
```

## Metadata directives

Comments and inline comments accept `@` directives:

```text
# Arrow right @tags: navigation, unicode @alias: seta, seta direita
<Multi_key> <r> <r> : "→"

# @name: Euro sign @tags: currency @alias: euro
<Multi_key> <space> <e> : "€"

# Personal password @sensitive
<Multi_key> <space> <p> : "hunter2"
```

| Directive | Effect |
|---|---|
| `@name: text` | Display name, overriding the comment text |
| `@tags: a, b` | Tags; searchable and filterable with `#tag` |
| `@alias: x, y` / `@aliases:` | Extra search terms |
| `@sensitive` | Hidden value in the UI, selected-only reveal, safe insertion through a `0600` file |

Directives inherit for consecutive rules under the same comment block, so all
variations of a group share tags and aliases. Unknown directives produce a
warning and stay visible as text. Limits: 8 tags and 8 aliases per rule, 64
characters each; `@name` is capped at 120 characters.

An entry marked `@sensitive` never falls back to its result as a description; if
there is no comment at all, the name becomes `(sensitive)`.

Run `scripts/demo` to open a safe showcase, or `scripts/demo --validate` to only
check [`examples/demo.XCompose`](../examples/demo.XCompose).

## Search

Indexed fields, in ranking order: result, aliases, name/description, tags, raw
key names, compact sequence, and displayed sequence. `rr` finds
`<Multi_key> <r> <r>`, `minus greater` finds the named-key variation, and
`#navigation` filters by tag. Setting `search.fuzzy` to `false` keeps only
exact, prefix, and substring matches.

Compose tokens can also be searched literally: `<space> <e>` matches a rule
containing those tokens in that order. Extra words keep the regular matching
heuristics, so `<space> <e> euro` requires both the Compose sequence and a match
for `euro`.

For faster key lookup, a leading literal character is also accepted for common
keysyms. For example, `/` matches `<slash>`, `[` matches `<bracketleft>`, and
`.` matches `<period>`. This includes `, : ; < > / \ [ ]`, brackets, quotes,
and standard symbol keys.

## Supported results

Results must be quoted strings. Actual Unicode text and `\n`, `\t`, `\r`, `\x`,
`\u`, `\U`, and octal escapes are decoded. A trailing keysym after the quoted
result is accepted and ignored for insertion.

```text
<Multi_key> <r> <r> : "\u2192" U2192
<Multi_key> <a> <r> : "\141\x72\U00000072"
```

Malformed rules are skipped and reported in the picker (`Ctrl+D`). Duplicate
sequences are warnings; one sequence producing multiple values is an error
because XCompose behaviour is ambiguous.

## Includes

```text
include "%L"
include "extra.XCompose"
include "~/work/.XCompose"
```

With `includes.enabled`, quoted files are resolved from the directory of the
file that includes them, following symlinks and cycles safely. `%L` and other
system placeholders are always ignored. At most 16 files and 1 MiB total are
indexed; anything else is reported in the diagnostics pane.

## Limits

For predictable shell responsiveness, the picker indexes at most a 1 MiB source,
5,000 rules, and 4,096 characters per decoded result. Larger sources are not
indexed; over-limit rules are skipped with a warning. Local history and favorites
are each limited to 64 KiB and 100 entries.

Before loading, the picker accepts only regular files (after resolving
symlinks) and rejects FIFOs, devices, and symlink loops.
