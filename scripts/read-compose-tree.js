#!/usr/bin/env node

"use strict"

const { loadTree } = require("./compose-tree")

const rootPath = process.argv[2]
const limit = Number(process.argv[3])
if (!rootPath || !Number.isSafeInteger(limit) || limit < 0) {
  process.stderr.write("read-compose-tree: path and byte limit are required\n")
  process.exit(2)
}

const tree = loadTree(rootPath, { maxBytes: limit, env: process.env })
if (tree.status !== 0) {
  if (tree.stderr) process.stderr.write(tree.stderr)
  process.exit(tree.status)
}

process.stdout.write(JSON.stringify({
  root: tree.root,
  files: tree.files,
  diagnostics: tree.diagnostics
}))
