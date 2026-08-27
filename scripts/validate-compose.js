#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const composePath = process.argv[2]
const maxSourceBytes = 1024 * 1024
if (!composePath) {
  console.error("error: XCompose path is required")
  process.exit(2)
}

try {
  if (fs.statSync(composePath).size > maxSourceBytes) {
    console.error(`error: XCompose file exceeds ${maxSourceBytes} bytes`)
    process.exit(2)
  }
  const parserPath = path.resolve(__dirname, "..", "XComposeParser.js")
  const context = { console }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(parserPath, "utf8"), context, { filename: parserPath })
  const parsed = context.parse(fs.readFileSync(composePath, "utf8"), composePath)
  const duplicates = parsed.diagnostics.filter(diagnostic => diagnostic.code === "duplicate-sequence" || diagnostic.code === "conflicting-sequence")

  if (!duplicates.length) {
    console.log("ok: no duplicate or conflicting XCompose sequences")
    process.exit(0)
  }

  let hasConflict = false
  for (const diagnostic of duplicates) {
    const prefix = diagnostic.severity === "error" ? "error" : "warning"
    if (diagnostic.severity === "error") hasConflict = true
    console.log(`${prefix}: line ${diagnostic.line}: ${diagnostic.message}`)
  }
  process.exit(hasConflict ? 1 : 0)
} catch (error) {
  console.error(`error: could not validate XCompose file: ${error.message}`)
  process.exit(2)
}
