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

const metaParsed = parser.parse(`
# Arrow right @tags: navigation, unicode @alias: arrowr, seta @sensitive
<Multi_key> <r> <r> : "→"
# Simple
<Multi_key> <c> : "©" # Copyright @alias: copyright
# @name: Euro sign @tags: currency
<Multi_key> <space> <e> : "€"
# @unknown: value
<Multi_key> <q> : "q"
`)

const metaEntry = metaParsed.entries[0]
assert.equal(metaEntry.name, "Arrow right")
assert.equal(metaEntry.description, "Arrow right")
assert.deepEqual(Array.from(metaEntry.tags), ["navigation", "unicode"])
assert.deepEqual(Array.from(metaEntry.aliases), ["arrowr", "seta"])
assert.equal(metaEntry.sensitive, true)
assert.deepEqual(Array.from(metaEntry.tagList), ["navigation", "unicode"])
assert.equal(metaEntry.descriptionPreview, "Arrow right")
const inlineEntry = metaParsed.entries[1]
assert.equal(inlineEntry.description, "Copyright")
assert.equal(inlineEntry.name, "Copyright")
assert.deepEqual(Array.from(inlineEntry.aliases), ["copyright"])
assert.equal(inlineEntry.sensitive, false)
const namedEntry = metaParsed.entries[2]
assert.equal(namedEntry.name, "Euro sign")
assert.equal(namedEntry.description, "€")
assert.deepEqual(Array.from(namedEntry.tags), ["currency"])
assert.ok(metaParsed.diagnostics.some(item => item.code === "unknown-directive"))
assert.equal(metaParsed.diagnostics.find(item => item.code === "unknown-directive").line, 8)

const sensitiveFallback = parser.parse(`# @sensitive\n<Multi_key> <p> : "hunter2"`).entries[0]
assert.equal(sensitiveFallback.description, "(sensitive)")
assert.equal(sensitiveFallback.name, "(sensitive)")
assert.equal(sensitiveFallback.descriptionPreview.includes("hunter2"), false)
assert.equal(sensitiveFallback.sensitive, true)

const cappedTags = parser.parse(`# Many @tags: a, b, c, d, e, f, g, h, i, j\n<Multi_key> <t> : "t"`)
assert.equal(cappedTags.entries[0].tags.length, parser.maxMetadataTags)
assert.ok(cappedTags.diagnostics.some(item => item.code === "metadata-limit"))

const duplicateTags = parser.parse(`# Dup @tags: nav, NAV, nav @alias: x, X\n<Multi_key> <d> : "d"`)
assert.deepEqual(Array.from(duplicateTags.entries[0].tags), ["nav"])
assert.deepEqual(Array.from(duplicateTags.entries[0].aliases), ["x"])

const multiComment = parser.parse(`# Line one\n# Line two @tags: multi\n<Multi_key> <m> : "m"`)
assert.equal(multiComment.entries[0].name, "Line one Line two")
assert.deepEqual(Array.from(multiComment.entries[0].tags), ["multi"])

const bundle = parser.parseBundle({
  files: [
    { path: "/tmp/root.XCompose", text: `<Multi_key> <r> <r> : "→"\n# Extra\n<Multi_key> <e> : "e"\n` },
    { path: "/tmp/inc.XCompose", text: `<Multi_key> <r> <r> : "different"\n<Multi_key> <b> : "b"\n` }
  ]
})
assert.equal(bundle.entries.length, 4)
assert.equal(bundle.entries[0].source, "/tmp/root.XCompose")
assert.equal(bundle.entries[1].name, "Extra")
assert.equal(bundle.entries[2].source, "/tmp/inc.XCompose")
assert.equal(bundle.entries[3].source, "/tmp/inc.XCompose")
assert.ok(bundle.diagnostics.some(item => item.code === "conflicting-sequence"))
assert.equal(parser.parseBundle({}).entries.length, 0)
assert.equal(parser.parseBundle(null).entries.length, 0)
const bundleCap = parser.parseBundle({
  files: [{ path: "/tmp/root.XCompose", text: Array.from({ length: parser.maxEntries + 1 }, (_, index) => `<Multi_key> <a> <${index}> : "x"`).join("\n") }]
})
assert.equal(bundleCap.entries.length, parser.maxEntries)
assert.ok(bundleCap.diagnostics.some(item => item.code === "entry-limit"))

const longResult = Array.from({ length: 200 }, (_, index) => `line ${index}`).join("\\n")
const longEntry = parser.parse(`<Multi_key> <l> <o> : "${longResult}" # Long output`).entries[0]
assert.equal(longEntry.result.split("\n").length, 200)
assert.equal(longEntry.valuePreview.includes("\n"), false)
assert.equal(longEntry.valuePreview.includes("↵"), true)
assert.equal(longEntry.valuePreview.length <= 80, true)

const tooLongResult = parser.parse(`<Multi_key> <l> : "${"x".repeat(parser.maxResultLength + 1)}"`)
assert.equal(tooLongResult.entries.length, 0)
assert.ok(tooLongResult.diagnostics.some(item => item.code === "result-too-long"))
const tooLargeSource = parser.parse("x".repeat(parser.maxSourceLength + 1))
assert.equal(tooLargeSource.entries.length, 0)
assert.ok(tooLargeSource.diagnostics.some(item => item.code === "source-too-large"))
const tooManyEntries = parser.parse(Array.from({ length: parser.maxEntries + 1 }, (_, index) => `<Multi_key> <a> <${index}> : "x"`).join("\n"))
assert.equal(tooManyEntries.entries.length, parser.maxEntries)
assert.ok(tooManyEntries.diagnostics.some(item => item.code === "entry-limit"))

for (let index = 0; index < 200; index++) {
  const source = Array.from({ length: 30 }, () => String.fromCharCode(Math.floor(Math.random() * 128))).join("")
  assert.doesNotThrow(() => parser.parse(source))
}

console.log("parser tests passed")
