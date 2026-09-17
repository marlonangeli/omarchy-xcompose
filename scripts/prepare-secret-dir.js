#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")

const target = process.argv[2]

function fail(message) {
  process.stderr.write(`prepare-secret-dir: ${message}\n`)
  process.exit(1)
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !!error && error.code === "EPERM"
  }
}

if (!target) fail("directory path is required")

try {
  try {
    fs.mkdirSync(target, { recursive: true, mode: 0o700 })
  } catch (error) {
    fail(error && error.message ? error.message : "unable to create directory")
  }

  const descriptor = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    const stat = fs.fstatSync(descriptor)
    const descriptorPath = fs.realpathSync(`/proc/self/fd/${descriptor}`)
    if (descriptorPath !== path.resolve(target)) throw new Error("directory path must not contain symlink components")
    if (!stat.isDirectory()) throw new Error("path is not a directory")
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("directory is not owned by the current user")
    fs.fchmodSync(descriptor, 0o700)
  } finally {
    fs.closeSync(descriptor)
  }

  const uid = typeof process.getuid === "function" ? process.getuid() : null
  for (const name of fs.readdirSync(target)) {
    const match = /^pending-(\d+)-\d+-\d+$/.exec(name)
    if (match && processAlive(Number(match[1]))) continue
    if (name !== "pending" && !match) continue

    const candidate = path.join(target, name)
    let stat
    try { stat = fs.lstatSync(candidate) } catch (_) { continue }
    if (!stat.isFile() || (uid !== null && stat.uid !== uid)) continue
    fs.unlinkSync(candidate)
  }
} catch (error) {
  fail(error && error.message ? error.message : "unable to prepare directory")
}
