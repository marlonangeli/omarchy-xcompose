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
const fixtures = path.join(__dirname, "..", "bench", "fixtures")

function fixture(name) {
  return fs.readFileSync(path.join(fixtures, name), "utf8")
}

for (const name of ["compose-100", "compose-1000"]) {
  const parsed = parser.parse(fixture(name), name)
  assert.equal(parsed.entries.length, Number(name.split("-")[1]))
  assert.equal(parsed.entries[0].source, name)
  assert.deepEqual(Array.from(parsed.diagnostics), [])
}

const unicode = parser.parse(fixture("compose-unicode"), "compose-unicode")
assert.equal(unicode.entries[0].result, "→")
assert.equal(unicode.entries[1].result, "Café")
assert.equal(unicode.entries[2].result, "😀")
assert.equal(unicode.entries[3].result, "ar")
assert.equal(unicode.entries[4].result, "first\nsecond\tthird")
assert.equal(unicode.entries[0].aliases.includes("seta"), true)

const comments = parser.parse(fixture("compose-comments"), "compose-comments")
assert.equal(comments.entries[0].name, "Arrow right Navigation keys")
assert.deepEqual(Array.from(comments.entries[0].tags), [])
assert.ok(comments.diagnostics.some(item => item.code === "unknown-directive"))
const sensitive = comments.entries.find(function(entry) { return entry.sensitive })
assert.equal(sensitive.result, "hunter2")
assert.equal(sensitive.name, "Secret")
assert.equal(sensitive.descriptionPreview.includes("hunter2"), false)

const duplicates = parser.parse(fixture("compose-duplicates"), "compose-duplicates")
assert.ok(duplicates.diagnostics.some(item => item.code === "duplicate-sequence"))
assert.ok(duplicates.diagnostics.some(item => item.code === "conflicting-sequence"))

const invalid = parser.parse(fixture("compose-invalid"), "compose-invalid")
assert.equal(invalid.entries.length, 1)
assert.ok(invalid.diagnostics.length >= 4)

const includes = parser.parseBundle({
  files: [
    { path: "compose-includes", text: fixture("compose-includes") },
    { path: "include-part-a", text: fixture("include-part-a") },
    { path: "include-part-b", text: fixture("include-part-b") }
  ]
})
assert.equal(includes.entries.length, 3)
assert.equal(includes.entries[0].source, "compose-includes")
assert.equal(includes.entries[1].source, "include-part-a")
assert.equal(includes.entries[2].source, "include-part-b")

console.log("fixture tests passed")
