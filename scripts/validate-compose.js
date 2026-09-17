#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const childProcess = require("node:child_process")
const path = require("node:path")
const vm = require("node:vm")

const composePath = process.argv[2]
const configIndex = process.argv.indexOf("--config")
const configPath = configIndex >= 0 ? process.argv[configIndex + 1] : ""
const maxSourceBytes = 1024 * 1024

if (!composePath) {
  console.error("error: XCompose path is required")
  process.exit(2)
}

function loadModule(name) {
  const modulePath = path.resolve(__dirname, "..", name)
  const context = { console }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, { filename: modulePath })
  return context
}

const configModule = loadModule("XComposeConfig.js")

function readConfig() {
  if (!configPath) return { config: configModule.empty(), hasError: false }
  try {
    const parsed = configModule.parse(fs.readFileSync(configPath, "utf8"))
    const diagnostics = Array.from(parsed.diagnostics)
    for (const item of diagnostics) console.log(`${item.severity === "error" ? "error" : "warning"}: config: ${item.message}`)
    return { config: parsed.config, hasError: diagnostics.some(function(item) { return item.severity === "error" }) }
  } catch (error) {
    console.error(`error: could not read configuration: ${error.message}`)
    process.exit(2)
  }
}

const configResult = readConfig()
const config = configResult.config
const home = process.env.HOME || ""
const roots = config.includes.roots.length
  ? config.includes.roots.map(function(root) { return configModule.resolvePath(root, home) })
  : home ? [path.resolve(home)] : []
const readOptions = {
  includes: { enabled: config.includes.enabled, roots: roots },
  // The validator checks the configured/environment source, not an untrusted
  // summon payload. Payload root enforcement remains in the picker.
  security: { restrictRoot: false, allowExternalPaths: true, allowedRoots: [] }
}

const readComposePath = path.resolve(__dirname, "read-compose.js")
const read = childProcess.spawnSync(process.execPath, [readComposePath, composePath, String(maxSourceBytes), JSON.stringify(readOptions)], { encoding: "utf8", maxBuffer: maxSourceBytes * 8 })

if (read.error || read.status !== 0) {
  const reason = read.stderr ? read.stderr.trim() : "unable to read XCompose file"
  console.error(`error: ${reason}`)
  process.exit(2)
}

let bundle
try {
  bundle = JSON.parse(read.stdout)
} catch (_) {
  console.error("error: could not read XCompose file")
  process.exit(2)
}

for (const item of bundle.diagnostics || []) {
  const prefix = item.severity === "error" ? "error" : item.severity === "warning" ? "warning" : "info"
  console.log(`${prefix}: ${item.message}`)
}

if (bundle.state === "missing") {
  console.error(`error: XCompose file does not exist: ${composePath}`)
  process.exit(2)
}
if (bundle.state !== "ok") {
  console.error(`error: ${bundle.message || "XCompose file is unreadable"}`)
  process.exit(2)
}

const parser = loadModule("XComposeParser.js")
const parsed = parser.parseBundle(bundle)
const problems = parsed.diagnostics.filter(function(diagnostic) {
  return diagnostic.severity === "error" || diagnostic.code === "duplicate-sequence"
})
const hasError = (bundle.diagnostics || []).some(function(diagnostic) { return diagnostic.severity === "error" }) ||
  parsed.diagnostics.some(function(diagnostic) { return diagnostic.severity === "error" }) || configResult.hasError

if (!problems.length && !hasError) {
  console.log("ok: no duplicate or conflicting XCompose sequences")
  process.exit(0)
}

for (const diagnostic of problems) {
  const prefix = diagnostic.severity === "error" ? "error" : "warning"
  console.log(`${prefix}: line ${diagnostic.line}: ${diagnostic.message}`)
}
process.exit(hasError ? 1 : 0)
