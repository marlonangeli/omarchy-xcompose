const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

function load(name) {
  const source = fs.readFileSync(path.join(__dirname, "..", name), "utf8")
  const context = { console }
  vm.createContext(context)
  vm.runInContext(source, context)
  return context
}

const parser = load("XComposeParser.js")
const parsed = parser.parse(`
# Arrow
# Right
<Multi_key> <r> <r> : "\\u2192" U2192
<Multi_key> <minus> <greater> : "→"
<Multi_key> <c> <o> : "©" # Copyright
<Multi_key> <t> <a> : "\\141\\x72\\U00000072"
<Multi_key> <q> <q> : "hash # inside"
<Multi_key> <bad> : nope
include "%L"
<Multi_key> <r> <r> : "→"
<Multi_key> <r> <r> : "different"
`, "/tmp/test.XCompose")

assert.equal(parsed.entries.length, 7)
assert.equal(parsed.entries[0].description, "Arrow Right")
assert.equal(parsed.entries[0].result, "→")
assert.equal(parsed.entries[0].displaySequence[0], "Key")
assert.equal(parsed.entries[1].description, "Arrow Right")
assert.equal(parsed.entries[2].description, "Copyright")
assert.equal(parsed.entries[3].result, "arr")
assert.equal(parsed.entries[4].result, "hash # inside")
assert.equal(parsed.entries[0].source, "/tmp/test.XCompose")
assert.match(parsed.entries[0].id, /^x[0-9a-f]{16}$/)
assert.equal(parsed.includes.length, 1)
assert.ok(parsed.diagnostics.some(item => item.code === "invalid-result"))
assert.ok(parsed.diagnostics.some(item => item.code === "duplicate-sequence"))
assert.ok(parsed.diagnostics.some(item => item.code === "conflicting-sequence"))
assert.equal(parsed.diagnostics.find(item => item.code === "duplicate-sequence").relatedLine, 4)
assert.equal(parsed.diagnostics.find(item => item.code === "conflicting-sequence").relatedLine, 4)

const longResult = Array.from({ length: 200 }, (_, index) => `line ${index}`).join("\\n")
const longEntry = parser.parse(`<Multi_key> <l> <o> : "${longResult}" # Long output`).entries[0]
assert.equal(longEntry.result.split("\n").length, 200)
assert.equal(longEntry.valuePreview.includes("\n"), false)
assert.equal(longEntry.valuePreview.includes("↵"), true)
assert.equal(longEntry.valuePreview.length <= 80, true)

for (let index = 0; index < 200; index++) {
  const source = Array.from({ length: 30 }, () => String.fromCharCode(Math.floor(Math.random() * 128))).join("")
  assert.doesNotThrow(() => parser.parse(source))
}

console.log("parser tests passed")
