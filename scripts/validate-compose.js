#!/usr/bin/env node

"use strict"

const { indexCompose } = require("./compose-tree")

const composePath = process.argv[2]
const maxSourceBytes = 1024 * 1024
if (!composePath) {
  console.error("error: XCompose path is required")
  process.exit(2)
}

try {
  const indexed = indexCompose(composePath, { maxBytes: maxSourceBytes, env: process.env })
  if (indexed.status !== 0) {
    const reason = indexed.stderr ? indexed.stderr.trim() : "unable to read XCompose file"
    console.error(`error: ${reason}`)
    process.exit(2)
  }

  const duplicates = indexed.parsed.diagnostics.filter(diagnostic => diagnostic.code === "duplicate-sequence" || diagnostic.code === "conflicting-sequence" || diagnostic.code === "overridden-sequence")

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
