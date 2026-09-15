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
const viewModel = load("XComposeViewModel.js")

assert.equal(viewModel.escapeMarkup("<b>&\"</b>"), "&lt;b&gt;&amp;&quot;&lt;/b&gt;")
assert.equal(viewModel.highlightMarkup("Arrow", [{ start: 0, length: 5 }]), "<b><u>Arrow</u></b>")
assert.equal(viewModel.highlightMarkup("Arrow", [{ start: 2, length: 2 }]), "Ar<b><u>ro</u></b>w")
assert.equal(viewModel.highlightMarkup("Arrow", [{ start: 3, length: 10 }]), "Arr<b><u>ow</u></b>")
assert.equal(viewModel.highlightMarkup("Arrow", [{ start: 5, length: 2 }]), "Arrow")
assert.equal(viewModel.highlightMarkup("<A>", [{ start: 0, length: 3 }]), "<b><u>&lt;A&gt;</u></b>")
assert.equal(viewModel.highlightMarkup("Arrow", [{ start: 2, length: 1 }, { start: 0, length: 1 }]), "<b><u>A</u></b>r<b><u>r</u></b>ow")
assert.equal(viewModel.sensitiveMasked(true, { maskSensitive: true }), true)
assert.equal(viewModel.sensitiveMasked(true, { maskSensitive: true, revealSensitive: true }), false)
assert.equal(viewModel.sensitiveMasked(true, { maskSensitive: false }), false)
assert.equal(viewModel.sensitiveMasked(false, { maskSensitive: true }), false)
assert.equal(viewModel.sourceLabel("/home/user/.XCompose"), ".XCompose")
assert.equal(viewModel.sourceLabel(""), "")

const entries = parser.parse(`
# Arrow right @tags: navigation @alias: seta
<Multi_key> <r> <r> : "→"
<Multi_key> <minus> <greater> : "→"
# Secret @sensitive
<Multi_key> <p> : "hunter2"
`).entries
const group = {
  groupId: "result:1",
  result: "→",
  variants: [entries[0], entries[1]],
  activeVariantIndex: 0,
  favorite: false
}
const selected = viewModel.selectVariant(group, {})
assert.equal(selected.variantIndex, 0)
assert.equal(selected.variant, entries[0])
const overridden = viewModel.selectVariant(group, { "result:1": 1 })
assert.equal(overridden.variantIndex, 1)
assert.equal(viewModel.selectVariant(group, { "result:1": 99 }).variantIndex, 1)
assert.equal(viewModel.selectVariant(group, { "result:1": -5 }).variantIndex, 0)

const row = viewModel.buildRow(group, entries[0], 0, { descriptionRanges: [{ start: 0, length: 5 }] }, { showTags: true, maskSensitive: true })
assert.equal(row.groupId, "result:1")
assert.equal(row.description, "Arrow right")
assert.match(row.descriptionMarkup, /^<b><u>Arrow<\/u><\/b>/)
assert.equal(row.preview, "→")
assert.equal(row.sequenceMarkup.includes("#navigation"), true)
assert.equal(row.sequenceMarkup.includes("1/2"), true)
assert.equal(row.favorite, false)
assert.equal(row.sensitive, false)

const sensitiveRow = viewModel.buildRow({ groupId: "g", result: "hunter2", variants: [entries[2]], activeVariantIndex: 0, favorite: true }, entries[2], 0, null, { showTags: true, maskSensitive: true })
assert.equal(sensitiveRow.preview, viewModel.sensitiveMask)
assert.equal(sensitiveRow.previewMarkup.includes("hunter2"), false)
assert.equal(sensitiveRow.sensitive, true)
assert.equal(sensitiveRow.groupId, "g")
assert.equal(sensitiveRow.favorite, true)

const revealedRow = viewModel.buildRow(group, entries[0], 0, null, { maskSensitive: true, revealSensitive: true })
assert.equal(revealedRow.preview, "→")
assert.equal(revealedRow.sequenceMarkup.includes("1/2"), true)
assert.equal(revealedRow.sequenceMarkup.includes("#navigation"), false)

assert.equal(viewModel.previewResultText(entries[0], "→", { maskSensitive: true }), "→")
assert.equal(viewModel.previewResultText(entries[2], "hunter2", { maskSensitive: true }), viewModel.sensitiveMask)
assert.equal(viewModel.previewResultText(entries[2], "hunter2", { maskSensitive: true, revealSensitive: true }), "hunter2")
assert.equal(viewModel.metadataText(entries[0]), "#navigation  •  seta")
assert.equal(viewModel.metadataText(entries[1]), "#navigation  •  seta")
assert.equal(viewModel.metadataText(entries[2]), "")

console.log("view model tests passed")
