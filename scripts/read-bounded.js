#!/usr/bin/env node

"use strict"

const readSafe = require("./read-safe.js")

const target = process.argv[2]
const limit = Number(process.argv[3])

try {
  process.stdout.write(readSafe.readBounded(target, limit))
} catch (error) {
  process.stderr.write(`read-bounded: ${error && error.message ? error.message : "unable to read path"}\n`)
  process.exit(error && error.exitCode ? error.exitCode : 4)
}
