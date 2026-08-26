const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs.readFileSync(path.join(__dirname, "..", "XComposeParser.js"), "utf8")
const parser = {}
vm.createContext(parser)
vm.runInContext(source, parser)

const entries = parser.parse(`
# Em dash
<Multi_key> <space> <space> : "—"
<Multi_key> <minus> <minus> : "—"

include "%L"

<Multi_key> <c> <o> : "©" # Copyright
<Multi_key> <x> <x> : "\\x2192"
<Multi_key> <q> <q> : "hash # inside"
<Multi_key> <b> <s> : "literal \\\\n"
`)

assert.equal(entries.length, 6)
assert.equal(entries[0].description, "Em dash")
assert.equal(entries[1].description, "Em dash")
assert.equal(entries[0].sequenceText, "Caps · Space · Space")
assert.equal(entries[2].description, "Copyright")
assert.equal(entries[3].value, "→")
assert.equal(entries[4].value, "hash # inside")
assert.equal(entries[5].value, "literal \\n")
assert.equal(parser.filter(entries, "copyright")[0].value, "©")
assert.equal(parser.filter(entries, "emdsh")[0].description, "Em dash")

const longResult = Array.from({ length: 200 }, (_, index) => `line ${index}`).join("\\n")
const longEntry = parser.parse(`<Multi_key> <l> <o> : "${longResult}" # Long output`)[0]

assert.equal(longEntry.value.split("\n").length, 200)
assert.equal(longEntry.valuePreview.includes("\n"), false)
assert.equal(longEntry.valuePreview.includes("↵"), true)
assert.equal(longEntry.valuePreview.length <= 80, true)
assert.equal(longEntry.searchText.length <= 1026, true)
assert.equal(parser.filter([longEntry], "long output").length, 1)

console.log("parser tests passed")
