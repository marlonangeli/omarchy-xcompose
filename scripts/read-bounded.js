#!/usr/bin/env node

"use strict"

const fs = require("node:fs")

const path = process.argv[2]
const limit = Number(process.argv[3])

function fail(code, message) {
  process.stderr.write(`read-bounded: ${message}\n`)
  process.exit(code)
}

if (!path || !Number.isSafeInteger(limit) || limit < 0) fail(2, "path and byte limit are required")

let descriptor
try {
  // lstat rejects a final-component symlink before opening it. O_NOFOLLOW and
  // fstat then make the check hold for the exact descriptor that is read.
  const before = fs.lstatSync(path)
  if (!before.isFile()) fail(4, "path is not a regular file")

  const flags = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW
  descriptor = fs.openSync(path, flags)
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
  process.stdout.write(buffer.subarray(0, offset))
} catch (error) {
  if (error && error.code === "ENOENT") fail(3, "file does not exist")
  if (error && error.code === "ELOOP") fail(4, "path is a symlink")
  fail(4, error && error.message ? error.message : "unable to read path")
} finally {
  if (descriptor !== undefined) {
    try { fs.closeSync(descriptor) } catch (_) {}
  }
}
