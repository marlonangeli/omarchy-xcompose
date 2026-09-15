#!/usr/bin/env node

"use strict"

const fs = require("node:fs")

function fail(code, message) {
  const error = new Error(message)
  error.exitCode = code
  throw error
}

function readBounded(target, limit) {
  if (!target || !Number.isSafeInteger(limit) || limit < 0) fail(2, "path and byte limit are required")

  let resolved
  try {
    // realpath resolves symlinks and rejects loops. Reading the resolved path
    // keeps a symlinked ~/.XCompose working while the fstat below still
    // refuses FIFOs, devices, and directories.
    resolved = fs.realpathSync(target)
  } catch (error) {
    if (error && error.code === "ENOENT") fail(3, "file does not exist")
    if (error && error.code === "ELOOP") fail(4, "path has a symlink loop")
    fail(4, error && error.message ? error.message : "unable to resolve path")
  }

  let descriptor
  try {
    const before = fs.statSync(resolved)
    if (!before.isFile()) fail(4, "path is not a regular file")

    descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
    const after = fs.fstatSync(descriptor)
    if (!after.isFile()) fail(4, "opened path is not a regular file")
    if (after.size > limit) fail(5, `file exceeds ${limit} bytes`)

    const buffer = Buffer.allocUnsafe(limit + 1)
    let offset = 0
    while (offset <= limit) {
      const read = fs.readSync(descriptor, buffer, offset, limit + 1 - offset, null)
      if (read === 0) break
      offset += read
    }
    if (offset > limit) fail(5, `file exceeds ${limit} bytes`)
    return buffer.subarray(0, offset).toString("utf8")
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch (_) {}
    }
  }
}

module.exports = { readBounded }
