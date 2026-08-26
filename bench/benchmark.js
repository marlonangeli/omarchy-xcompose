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

function fixture(count) {
  return Array.from({ length: count }, (_, index) => `# Item ${index}\n<Multi_key> <F${index}> : "item-${index}"`).join("\n")
}

function elapsed(operation) {
  const start = process.hrtime.bigint()
  const result = operation()
  return { result, milliseconds: Number(process.hrtime.bigint() - start) / 1e6 }
}

for (const size of [100, 1000, 10000]) {
  const parsed = elapsed(() => parser.parse(fixture(size), `bench-${size}`))
  const indexed = elapsed(() => search.search(parsed.result.entries, "item 9", { entries: {} }, 100))
  console.log(`${size}\tparse ${parsed.milliseconds.toFixed(2)} ms\tsearch ${indexed.milliseconds.toFixed(2)} ms\tentries ${parsed.result.entries.length}`)
}
