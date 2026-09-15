# Benchmarks

```bash
bench/run            # fixtures up to 1,000 entries
bench/run --stress   # also generates the 10,000-rule fixture
```

`bench/run` generates deterministic fixtures under `bench/fixtures/` and measures
each stage separately: `read` → `parse` → `index` → `query`. The 10,000-rule
fixture is git-ignored; the others double as the test corpus.

The parser caps indexing at 5,000 entries, so `compose-10000` measures the cost
of scanning 10,000 lines while respecting the rule cap.

## Reference environment

- Linux, Node.js 25 (same runtime as `read-compose.js`)
- Quickshell/`omarchy-shell` is not part of the measurement: the benchmark runs
  only the JavaScript modules

## Typical result (development machine)

| Fixture | read | parse | index | query p50 | query p95 |
|---|---:|---:|---:|---:|---:|
| compose-100 | 0.11 ms | 7.40 ms | 0.86 ms | 1.11 ms | 2.35 ms |
| compose-1000 | 0.08 ms | 19.07 ms | 2.07 ms | 3.58 ms | 5.59 ms |
| compose-10000 (--stress) | 0.94 ms | 126 ms | 12.6 ms | 21.0 ms | 30.7 ms |

The first two rows include JIT warm-up on the first round; the stable `parse 1k`
number is around 18–20 ms.

## Initial budgets

```text
parse 1k    < 20 ms
parse 10k  < 100 ms
query p95   < 8 ms
```

Budgets are working references, not a contract: they depend on the machine and
the runtime. If a change makes a stage meaningfully worse, the benchmark shows
exactly where.

## Optimization history

- `opaqueId` replaced `Math.imul` with two bitwise accumulators: ~10x faster on
  the Quickshell runtime (`parse 1k` went from ~30 ms to ~19 ms).
- `normalize` gained an ASCII fast path: entries without accents skip
  `String.normalize`.
- `compactPreview` runs a single regex pass with a callback.
- `search()` returns the match ranges of the active variant, avoiding a second
  matching pass per visible row.
