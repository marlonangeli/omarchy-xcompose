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
const entries = parser.parse(`
# Arrow right
<Multi_key> <r> <r> : "→"
<Multi_key> <minus> <greater> : "→"
# Arrow left
<Multi_key> <l> <l> : "←"
`).entries

let state = history.empty()
state = history.record(state, entries[2].id, 1000, 100)
assert.equal(Object.keys(state.entries).length, 1)
assert.equal(history.parse("not json").schemaVersion, 1)
assert.deepEqual(history.parse(JSON.stringify(state)), state)

let rows = search.search(entries, "→", state, 100)
assert.equal(rows.length, 1)
assert.equal(rows[0].variants.length, 2)
assert.equal(rows[0].result, "→")
assert.equal(search.search(entries, "minus greater", state, 100)[0].result, "→")
assert.equal(search.search(entries, "rr", state, 100)[0].result, "→")
assert.equal(search.search(entries, "arw rgt", state, 100)[0].result, "→")
assert.equal(search.search(entries, "", state, 100)[0].result, "←")
assert.ok(search.search(entries, "arrow", state, 100)[0].descriptionRanges.length > 0)

console.log("search/history tests passed")
