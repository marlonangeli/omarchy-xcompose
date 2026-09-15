#!/usr/bin/env node

"use strict"

const childProcess = require("node:child_process")
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

const stress = process.argv.includes("--stress")
const fixtureDirectory = path.join(__dirname, "fixtures")
const queries = ["item 9", "arrow", "rr", "<space> <e>", "tag2"]
const sizes = [100, 1000].concat(stress ? [10000] : [])

const missing = sizes.filter(function(size) { return !fs.existsSync(path.join(fixtureDirectory, `compose-${size}`)) })
if (missing.length) {
  childProcess.execFileSync(process.execPath, [path.join(__dirname, "generate.js")].concat(stress ? ["--stress"] : []), { stdio: "inherit" })
}

function elapsed(operation) {
  const start = process.hrtime.bigint()
  const result = operation()
  return { result: result, milliseconds: Number(process.hrtime.bigint() - start) / 1e6 }
}

function percentile(values, fraction) {
  const sorted = values.slice().sort(function(a, b) { return a - b })
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function median(values) {
  return percentile(values, 0.5)
}

console.log("Benchmark (stages: read -> parse -> index -> query, median of repeated runs)")

for (const size of sizes) {
  const file = path.join(fixtureDirectory, `compose-${size}`)
  const rounds = size >= 10000 ? 5 : 20

  let text = fs.readFileSync(file, "utf8")
  let entries = parser.parse(text, file).entries
  search.search(entries, "", null, null, 100)
  search.search(entries, "item 9", null, null, 100)

  const readTimes = []
  const parseTimes = []
  const indexTimes = []
  const queryTimes = []
  for (let round = 0; round < rounds; round++) {
    readTimes.push(elapsed(function() { return fs.readFileSync(file, "utf8") }).milliseconds)
    parseTimes.push(elapsed(function() { return parser.parse(text, file) }).milliseconds)
    indexTimes.push(elapsed(function() { return search.search(entries, "", null, null, 100) }).milliseconds)
    for (const query of queries) queryTimes.push(elapsed(function() { return search.search(entries, query, null, null, 100) }).milliseconds)
  }

  console.log([
    `compose-${size}`,
    `read ${median(readTimes).toFixed(2)}ms`,
    `parse ${median(parseTimes).toFixed(2)}ms`,
    `index ${median(indexTimes).toFixed(2)}ms`,
    `query p50 ${percentile(queryTimes, 0.5).toFixed(2)}ms`,
    `p95 ${percentile(queryTimes, 0.95).toFixed(2)}ms`,
    `${entries.length} entries`
  ].join("  "))
}

console.log("")
console.log(`budget parse 1k:   ${median(parseTimes1000()).toFixed(2)} ms / 20 ms`)
if (stress) console.log(`budget parse 10k:  ${median(parseTimes10000()).toFixed(2)} ms / 100 ms`)
else console.log("budget parse 10k:  skipped (run with --stress)")

function parseTimes1000() {
  const file = path.join(fixtureDirectory, "compose-1000")
  const text = fs.readFileSync(file, "utf8")
  const times = []
  for (let round = 0; round < 50; round++) times.push(elapsed(function() { return parser.parse(text, file) }).milliseconds)
  return times
}

function parseTimes10000() {
  const file = path.join(fixtureDirectory, "compose-10000")
  const text = fs.readFileSync(file, "utf8")
  const times = []
  for (let round = 0; round < 10; round++) times.push(elapsed(function() { return parser.parse(text, file) }).milliseconds)
  return times
}
