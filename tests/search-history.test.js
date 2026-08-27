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
assert.equal(search.search(entries, "minus greater", state, 100)[0].result, "→")
assert.equal(search.search(entries, "rr", state, 100)[0].result, "→")
assert.equal(search.search(entries, "arw rgt", state, 100)[0].result, "→")
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

console.log("search/history tests passed")
