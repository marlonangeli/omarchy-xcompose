#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")
const readSafe = require("./read-safe.js")

const maxFiles = 16
const rootPath = process.argv[2]
const limit = Number(process.argv[3])
let options = {}
try { options = JSON.parse(process.argv[4] || "{}") } catch (_) { options = {} }
const includes = options.includes && typeof options.includes === "object" ? options.includes : {}
const includeEnabled = includes.enabled === true
const includeRoots = Array.isArray(includes.roots) ? includes.roots.map(function(root) { return path.resolve(root) }) : []
const security = options.security && typeof options.security === "object" ? options.security : {}
const restrictRoot = security.restrictRoot === true
const allowExternalPaths = security.allowExternalPaths === true
const allowedRoots = Array.isArray(security.allowedRoots) ? security.allowedRoots.map(function(root) { return path.resolve(root) }) : []

function underRoots(target, roots) {
  if (!roots.length) return true
  return roots.some(function(root) { return target === root || target.indexOf(root + path.sep) === 0 })
}

function parseIncludeLine(line) {
  const match = /^include\s+(.+)$/.exec(line.trim())
  if (!match) return null
  const quoted = /^"([^"]+)"\s*$/.exec(match[1].trim())
  if (!quoted) return { value: match[1].trim(), state: "unparsed" }
  const value = quoted[1]
  if (value.indexOf("%") >= 0) return { value: value, state: "system" }
  return { value: value, state: "ok" }
}

function findIncludes(text) {
  const output = []
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim()
    if (!trimmed || trimmed.charAt(0) === "#") continue
    const include = parseIncludeLine(trimmed)
    if (include) output.push({ line: index + 1, value: include.value, state: include.state })
  }
  return output
}

function resolveInclude(value, baseDir) {
  const expanded = value.indexOf("~/") === 0 ? path.join(process.env.HOME || "", value.substring(2)) : value
  return path.resolve(baseDir, expanded)
}

function main() {
  if (!rootPath || !Number.isSafeInteger(limit) || limit < 0) {
    process.stderr.write("read-compose: path and byte limit are required\n")
    process.exit(2)
  }

  const bundle = { state: "ok", path: rootPath, message: "", files: [], diagnostics: [] }
  const visited = new Set()
  let totalBytes = 0

  function visit(target, isRoot, sourceLine) {
    let resolved
    try {
      resolved = fs.realpathSync(target)
    } catch (error) {
      if (isRoot) {
        bundle.state = error && error.code === "ENOENT" ? "missing" : "invalid"
        bundle.message = error && error.message ? error.message : "unable to read XCompose file"
        return
      }
      bundle.diagnostics.push({ severity: "warning", code: "include-missing", message: `Included file is unavailable: ${target}` })
      return
    }

    if (isRoot && restrictRoot && !allowExternalPaths && !underRoots(resolved, allowedRoots)) {
      bundle.state = "invalid"
      bundle.message = `XCompose path is outside the allowed roots: ${resolved}`
      return
    }

    if (!isRoot && !underRoots(resolved, includeRoots)) {
      bundle.diagnostics.push({ severity: "warning", code: "include-denied", message: `Included file is outside the configured roots: ${resolved}` })
      return
    }

    if (visited.has(resolved)) {
      if (!isRoot) bundle.diagnostics.push({ severity: "warning", code: "include-cycle", message: `Skipped cyclic include on line ${sourceLine}: ${resolved}` })
      return
    }

    if (bundle.files.length >= maxFiles) {
      bundle.diagnostics.push({ severity: "error", code: "include-limit", message: `Stopped after ${maxFiles} compose files` })
      return
    }

    let text
    try {
      text = readSafe.readBounded(resolved, limit - totalBytes)
    } catch (error) {
      if (isRoot) {
        bundle.state = error.exitCode === 5 ? "too-large" : "invalid"
        bundle.message = error && error.message ? error.message : "unable to read XCompose file"
        return
      }
      const severity = error.exitCode === 5 ? "error" : "warning"
      bundle.diagnostics.push({ severity: severity, code: "include-unreadable", message: `${resolved}: ${error && error.message ? error.message : "unable to read included file"}` })
      return
    }

    visited.add(resolved)
    totalBytes += Buffer.byteLength(text)
    if (isRoot) bundle.path = resolved
    bundle.files.push({ path: resolved, text: text, line: isRoot ? 0 : sourceLine })

    const includes = findIncludes(text)
    if (!includeEnabled) {
      if (includes.length) bundle.diagnostics.push({ severity: "info", code: "include-disabled", message: `Ignored ${includes.length} include directive(s); enable includes in the configuration to index them` })
      return
    }
    const baseDir = path.dirname(resolved)
    for (const include of includes) {
      if (include.state === "system") {
        bundle.diagnostics.push({ severity: "info", code: "include-system", message: `System include skipped on line ${include.line}: ${include.value}` })
        continue
      }
      if (include.state === "unparsed") {
        bundle.diagnostics.push({ severity: "warning", code: "include-unparsed", message: `Quoted include expected on line ${include.line}: ${include.value}` })
        continue
      }
      visit(resolveInclude(include.value, baseDir), false, include.line)
    }
  }

  visit(rootPath, true, 0)
  process.stdout.write(JSON.stringify(bundle))
}

main()
