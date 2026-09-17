#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")

function fail(code, message) {
  const error = new Error(message)
  error.exitCode = code
  throw error
}

function normalizedRoots(roots) {
  return roots.filter(function(root) { return typeof root === "string" && root.length > 0 }).map(function(root) {
    try { return fs.realpathSync(root) } catch (_) { return path.resolve(root) }
  })
}

function underRoots(target, roots) {
  return roots.some(function(root) {
    const relative = path.relative(root, target)
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  })
}

function withBoundedFile(target, limit, options, callback) {
  if (!target || !Number.isSafeInteger(limit) || limit < 0) fail(2, "path and byte limit are required")
  if (typeof callback !== "function") fail(2, "bounded file callback is required")

  const roots = options && Array.isArray(options.roots) ? normalizedRoots(options.roots) : null
  let candidate
  try {
    candidate = fs.realpathSync(target)
  } catch (error) {
    if (error && error.code === "ENOENT") fail(3, "file does not exist")
    if (error && error.code === "ELOOP") fail(4, "path has a symlink loop")
    fail(4, error && error.message ? error.message : "unable to resolve path")
  }
  if (roots && !underRoots(candidate, roots)) fail(6, `path is outside the allowed roots: ${candidate}`)

  let descriptor
  try {
    descriptor = fs.openSync(candidate, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW)
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile()) fail(4, "opened path is not a regular file")

    let openedPath
    try {
      const descriptorPath = `/proc/self/fd/${descriptor}`
      openedPath = fs.realpathSync.native ? fs.realpathSync.native(descriptorPath) : fs.realpathSync(descriptorPath)
    } catch (_) {
      fail(4, "unable to verify opened path")
    }
    if (roots && !underRoots(openedPath, roots)) fail(6, `path is outside the allowed roots: ${openedPath}`)

    return callback({
      path: openedPath,
      size: stat.size,
      read: function() {
        if (stat.size > limit) fail(5, `file exceeds ${limit} bytes`)
        const buffer = Buffer.allocUnsafe(limit + 1)
        let offset = 0
        while (offset <= limit) {
          const read = fs.readSync(descriptor, buffer, offset, limit + 1 - offset, null)
          if (read === 0) break
          offset += read
        }
        if (offset > limit) fail(5, `file exceeds ${limit} bytes`)
        return buffer.subarray(0, offset).toString("utf8")
      }
    })
  } catch (error) {
    if (error && error.exitCode) throw error
    if (error && error.code === "ENOENT") fail(3, "file does not exist")
    if (error && error.code === "ELOOP") fail(4, "path changed while opening")
    fail(4, error && error.message ? error.message : "unable to open path")
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch (_) {}
    }
  }
}

function readBoundedFile(target, limit, options) {
  return withBoundedFile(target, limit, options, function(file) {
    return { path: file.path, text: file.read() }
  })
}

function readBounded(target, limit) {
  return readBoundedFile(target, limit).text
}

module.exports = { readBounded, readBoundedFile, withBoundedFile, underRoots }
