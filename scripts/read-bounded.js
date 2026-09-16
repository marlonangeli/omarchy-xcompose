#!/usr/bin/env node

"use strict"

const fs = require("node:fs")

function failResult(code, message) {
  return { status: code, stdout: Buffer.alloc(0), stderr: `read-bounded: ${message}\n` }
}

function readBounded(targetPath, limit) {
  if (!targetPath || !Number.isSafeInteger(limit) || limit < 0) return failResult(2, "path and byte limit are required")

  let descriptor
  try {
    // lstat rejects a final-component symlink before opening it. O_NOFOLLOW and
    // fstat then make the check hold for the exact descriptor that is read.
    const before = fs.lstatSync(targetPath)
    if (!before.isFile()) return failResult(4, "path is not a regular file")

    const flags = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW
    descriptor = fs.openSync(targetPath, flags)
    const after = fs.fstatSync(descriptor)
    if (!after.isFile()) return failResult(4, "opened path is not a regular file")
    if (after.size > limit) return failResult(5, `file exceeds ${limit} bytes`)

    const buffer = Buffer.allocUnsafe(limit + 1)
    let offset = 0
    while (offset <= limit) {
      const read = fs.readSync(descriptor, buffer, offset, limit + 1 - offset, null)
      if (read === 0) break
      offset += read
    }
    if (offset > limit) return failResult(5, `file exceeds ${limit} bytes`)
    return { status: 0, stdout: buffer.subarray(0, offset), stderr: "" }
  } catch (error) {
    if (error && error.code === "ENOENT") return failResult(3, "file does not exist")
    if (error && error.code === "ELOOP") return failResult(4, "path is a symlink")
    return failResult(4, error && error.message ? error.message : "unable to read path")
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch (_) {}
    }
  }
}

function main() {
  const targetPath = process.argv[2]
  const limit = Number(process.argv[3])
  const result = readBounded(targetPath, Number.isFinite(limit) ? limit : NaN)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status === 0) process.stdout.write(result.stdout)
  process.exit(result.status)
}

module.exports = { readBounded }

if (require.main === module) main()
