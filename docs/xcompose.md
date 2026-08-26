# XCompose format

The picker indexes direct rules from `$XCOMPOSEFILE` or `~/.XCompose`. `include` directives are deliberately ignored in v0.2 so personal results stay fast and predictable.

## Descriptions

A consecutive comment block describes subsequent rules until a blank line. An inline comment is more specific and takes precedence.

```text
# Arrow right
# Navigation
<Multi_key> <r> <r> : "→"
<Multi_key> <minus> <greater> : "→"

<Multi_key> <c> <o> : "©" # Copyright
```

Descriptions, results, displayed keys, raw keys, and compact sequences are searchable. `rr` therefore finds `<Multi_key> <r> <r>` and `minus greater` finds the named-key variation.

## Supported results

Results must be quoted strings. Actual Unicode text and `\\n`, `\\t`, `\\r`, `\\x`, `\\u`, `\\U`, and octal escapes are decoded. A trailing keysym after the quoted result is accepted and ignored for insertion.

```text
<Multi_key> <r> <r> : "\\u2192" U2192
<Multi_key> <a> <r> : "\\141\\x72\\U00000072"
```

Malformed rules are skipped and reported in the picker. Duplicate sequences are warnings; one sequence producing multiple values is an error because XCompose behavior is ambiguous.
