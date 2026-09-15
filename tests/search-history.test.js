const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

function load(name) {
  const context = { console }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", name), "utf8"), context)
  return context
}

const parser = load("XComposeParser.js")
const search = load("XComposeSearch.js")
const history = load("XComposeHistory.js")
const favorites = load("XComposeFavorites.js")
const entries = parser.parse(`
# Arrow right
<Multi_key> <r> <r> : "→"
<Multi_key> <minus> <greater> : "→"
# Arrow left
<Multi_key> <l> <l> : "←"
# Euro sign
<Multi_key> <space> <e> : "€"
# Name
<Multi_key> <space> <n> : "Name"
# Repeated spaces
<Multi_key> <space> <space> <d> : "Double space"
# Punctuation
<Multi_key> <slash> <s> : "/"
<Multi_key> <bracketleft> <b> : "["
# Multiline result
<Multi_key> <m> : "first\\nneedle"
`).entries

let state = history.empty()
state = history.record(state, entries[2].id, 1000, 100)
assert.equal(Object.keys(state.entries).length, 1)
assert.equal(history.parse("not json").schemaVersion, 1)
assert.deepEqual(history.parse(JSON.stringify(state)), state)

let pins = favorites.empty()
pins = favorites.toggle(pins, entries[0].id, 100)
assert.equal(favorites.isFavorite(pins, entries[0].id), true)
assert.equal(favorites.isFavorite(favorites.parse("invalid"), entries[0].id), false)
pins = favorites.toggle(pins, entries[0].id, 100)
assert.equal(favorites.isFavorite(pins, entries[0].id), false)
pins = favorites.toggle(pins, entries[0].id, 100)

let rows = search.search(entries, "→", state, 100)
assert.equal(rows.length, 1)
assert.equal(rows[0].variants.length, 2)
assert.equal(rows[0].result, "→")
const inheritedKeys = parser.parse(`
<Multi_key> <c> : "constructor"
<Multi_key> <p> : "__proto__"
`).entries
assert.doesNotThrow(() => search.search(inheritedKeys, "", state, 100))
assert.doesNotThrow(() => search.search(inheritedKeys, "constructor", state, 100))
assert.deepEqual(Array.from(search.search(inheritedKeys, "", state, 100), row => row.result).sort(), ["__proto__", "constructor"])
assert.equal(search.search(entries, "minus greater", state, 100)[0].result, "→")
assert.equal(search.search(entries, "rr", state, 100)[0].result, "→")
assert.equal(search.search(entries, "arw rgt", state, 100)[0].result, "→")
assert.equal(search.search(entries, "arrow right", state, 100, { fuzzy: true })[0].result, "→")
assert.equal(search.search(entries, "arw rgt", state, 100, { fuzzy: false }).length, 0)
assert.equal(search.search(entries, "arrow right", state, 100, { fuzzy: false })[0].result, "→")
assert.equal(search.matchEntry(entries[0], "arw rgt", { fuzzy: false }), null)
assert.equal(search.search(entries, "<space> <e>", state, 100)[0].result, "€")
assert.equal(search.search(entries, "<space> <space>", state, 100)[0].result, "Double space")
assert.deepEqual(Array.from(search.composeTokenQuery("<space> <space>").tokens), ["space", "space"])
assert.deepEqual(Array.from(search.composeTokenQuery("  ").tokens), ["space", "space"])
assert.equal(search.search(entries, "  ", state, 100)[0].result, "Double space")
assert.equal(search.search(entries, "<space> <e> euro", state, 100)[0].result, "€")
assert.equal(search.search(entries, "<space> <r>", state, 100).length, 0)
assert.equal(search.search(entries, " n", state, 100)[0].result, "Name")
assert.equal(search.search(entries, "n", state, 100)[0].result, "Name")
assert.equal(search.search(entries, "/", state, 100)[0].result, "/")
assert.equal(search.search(entries, "[", state, 100)[0].result, "[")
const literalTokens = { ".": "period", ":": "colon", ";": "semicolon", "<": "less", ">": "greater", "/": "slash", "\\": "backslash", "[": "bracketleft", "]": "bracketright" }
for (const [character, token] of Object.entries(literalTokens)) {
  assert.deepEqual(Array.from(search.composeTokenQuery(character).tokens), [token])
}
assert.equal(search.search(entries, "", state, 100)[0].result, "←")
assert.equal(search.search(entries, "", state, pins, 100)[0].result, "→")
const descriptionMatch = search.matchEntry(entries[0], "arrow")
const resultMatch = search.matchEntry(entries[0], "→")
const patternMatch = search.matchEntry(entries[0], "rr")
const tokenMatch = search.matchEntry(entries[3], "<space> <e>")
const minusMatch = search.matchEntry(entries[1], "minus")
const multilineEntry = entries.find(function(entry) { return entry.result === "first\nneedle" })
const multilineMatch = search.matchEntry(multilineEntry, "needle")
assert.ok(descriptionMatch.descriptionRanges.length > 0)
assert.ok(resultMatch.resultRanges.length > 0)
assert.deepEqual(Array.from(patternMatch.sequenceRanges, function(range) { return { start: range.start, length: range.length } }), [
  { start: entries[0].sequencePreview.indexOf("R"), length: 1 },
  { start: entries[0].sequencePreview.lastIndexOf("R"), length: 1 }
])
assert.deepEqual(Array.from(minusMatch.sequenceRanges, function(range) { return { start: range.start, length: range.length } }), [{ start: entries[1].sequencePreview.indexOf("Minus"), length: "Minus".length }])
assert.ok(tokenMatch.sequenceRanges.length > 0)
assert.equal(multilineEntry.valuePreview, "first ↵ needle")
assert.deepEqual(Array.from(multilineMatch.resultRanges, function(range) { return range.start }), [0, 1, 2, 3, 4, 5].map(function(offset) { return multilineEntry.valuePreview.indexOf("needle") + offset }))
const tagged = parser.parse(`
# Arrow right @tags: navigation, unicode @alias: seta
<Multi_key> <r> <r> : "→"
# Em dash @tags: punctuation @alias: emdash, travessão
<Multi_key> <space> <space> : "—"
# Secret @sensitive
<Multi_key> <p> : "hunter2"
`).entries
assert.equal(search.search(tagged, "#navigation", state, 100)[0].result, "→")
assert.equal(search.search(tagged, "#punctuation", state, 100)[0].result, "—")
assert.equal(search.search(tagged, "#missing", state, 100).length, 0)
assert.equal(search.search(tagged, "#navigation arrow", state, 100)[0].result, "→")
assert.equal(search.search(tagged, "#navigation emdash", state, 100).length, 0)
assert.equal(search.search(tagged, "seta", state, 100)[0].result, "→")
assert.equal(search.search(tagged, "emdash", state, 100)[0].result, "—")
assert.equal(search.search(tagged, "travessão", state, 100)[0].result, "—")
assert.equal(search.search(tagged, "unicode", state, 100)[0].result, "→")
assert.equal(search.search(tagged, "hunter2", state, 100)[0].result, "hunter2")
assert.equal(search.search(tagged, "secret", state, 100)[0].result, "hunter2")
assert.equal(search.search(tagged, "#secret", state, 100).length, 0)
assert.equal(search.search(tagged, "", state, 100).length, 3)
assert.equal(search.matchEntry(tagged[0], "#navigation", { fuzzy: false }).score > 0, true)
assert.equal(search.matchEntry(tagged[0], "#nav", { fuzzy: false }), null)
assert.deepEqual(JSON.parse(JSON.stringify(search.tagQuery("#navigation arrow"))), { tag: "navigation", remaining: "arrow" })
assert.equal(search.tagQuery("#"), null)

const rangeRows = search.search(entries, "arrow", state, 100)
assert.ok(rangeRows[0].descriptionRanges.length > 0)
assert.deepEqual(Array.from(rangeRows[0].resultRanges), [])
assert.deepEqual(Array.from(rangeRows[0].sequenceRanges), [])
const resultRows = search.search(entries, "→", state, 100)
assert.ok(resultRows[0].resultRanges.length > 0)
const sequenceRows = search.search(entries, "rr", state, 100)
assert.ok(sequenceRows[0].sequenceRanges.length > 0)
const emptyRows = search.search(entries, "", state, 100)
assert.deepEqual(Array.from(emptyRows[0].descriptionRanges), [])
assert.deepEqual(Array.from(emptyRows[0].resultRanges), [])
assert.deepEqual(Array.from(emptyRows[0].sequenceRanges), [])
for (const text of ["", "Arrow", "→", "Café", "Ünïcödé", "Multi_key rr", "  spaced  ", "ﬁne ﬂow", "ß", "ÅNGSTRÖM", "①②③"]) {
  assert.equal(parser.normalize(text), search.normalize(text))
}
assert.equal(parser.maxSourceBytes, parser.maxSourceLength)
assert.equal(history.maxStateBytes, history.maxStateLength)
assert.equal(favorites.maxStateBytes, favorites.maxStateLength)
assert.equal(history.maxStateBytes, favorites.maxStateBytes)
assert.equal(history.parse("x".repeat(history.maxStateLength + 1)).entries && Object.keys(history.parse("x".repeat(history.maxStateLength + 1)).entries).length, 0)
assert.equal(favorites.parse("x".repeat(favorites.maxStateLength + 1)).ids && Object.keys(favorites.parse("x".repeat(favorites.maxStateLength + 1)).ids).length, 0)
const manyHistoryEntries = {}
const manyFavoriteIds = {}
for (let index = 0; index < 101; index++) {
  const id = `x${index.toString(16).padStart(16, "0")}`
  manyHistoryEntries[id] = { count: 1, lastUsed: index }
  manyFavoriteIds[id] = true
}
assert.equal(Object.keys(history.parse(JSON.stringify({ schemaVersion: 1, entries: manyHistoryEntries })).entries).length, history.maxStateEntries)
assert.equal(Object.keys(favorites.parse(JSON.stringify({ schemaVersion: 1, ids: manyFavoriteIds })).ids).length, favorites.maxStateEntries)

console.log("search/history tests passed")
