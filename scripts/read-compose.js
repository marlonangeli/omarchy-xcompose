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
const configuredIncludeRoots = Array.isArray(includes.roots) ? includes.roots.filter(function(root) { return typeof root === "string" && root.length > 0 }) : []
const includeRoots = configuredIncludeRoots.length
  ? configuredIncludeRoots.map(canonicalRoot)
  : includeEnabled && process.env.HOME ? [canonicalRoot(process.env.HOME)] : []
const security = options.security && typeof options.security === "object" ? options.security : {}
const restrictRoot = security.restrictRoot === true
const allowExternalPaths = security.allowExternalPaths === true
const allowedRoots = Array.isArray(security.allowedRoots) ? security.allowedRoots.filter(function(root) { return typeof root === "string" && root.length > 0 }).map(function(root) { return path.resolve(root) }) : []

function canonicalRoot(root) {
  try { return fs.realpathSync(root) } catch (_) { return path.resolve(root) }
}

function watchPathAllowed(target, roots) {
  try {
    return readSafe.underRoots(fs.realpathSync(target), roots)
  } catch (error) {
    if (!error || error.code !== "ENOENT") return false
    try {
      const parent = fs.realpathSync(path.dirname(target))
      return readSafe.underRoots(path.join(parent, path.basename(target)), roots)
    } catch (_) {
      return false
    }
  }
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

  const bundle = { state: "ok", path: rootPath, message: "", files: [], watchPaths: [], watchLimitReached: false, diagnostics: [] }
  const visited = new Set()
  const watched = new Set()
  let totalBytes = 0
  let limitReported = false
  let watchLimitReported = false

  function reportLimit() {
    if (limitReported) return
    limitReported = true
    bundle.diagnostics.push({ severity: "error", code: "include-limit", message: `Stopped after ${maxFiles} compose files` })
  }

  function addWatchPath(requestedPath, roots) {
    if (requestedPath === path.resolve(rootPath) || requestedPath === bundle.path || watched.has(requestedPath)) return true
    if (!watchPathAllowed(requestedPath, roots)) return true
    if (bundle.watchPaths.length >= maxFiles - 1) {
      bundle.watchLimitReached = true
      if (!watchLimitReported) {
        watchLimitReported = true
        bundle.diagnostics.push({ severity: "warning", code: "include-watch-limit", message: `Watching at most ${maxFiles - 1} include paths; polling for additional changes` })
      }
      return true
    }
    watched.add(requestedPath)
    bundle.watchPaths.push(requestedPath)
    return true
  }

  function visit(target, isRoot, sourceLine) {
    const roots = isRoot
      ? (restrictRoot && !allowExternalPaths ? allowedRoots : null)
      : includeRoots
    const requestedPath = path.resolve(target)
    if (!isRoot) addWatchPath(requestedPath, roots)

    // This early cycle check is only an optimization. The descriptor-derived
    // path is checked again below before any bytes are read.
    try {
      const candidate = fs.realpathSync(target)
      if (visited.has(candidate)) {
        if (!isRoot) bundle.diagnostics.push({ severity: "warning", code: "include-cycle", message: `Skipped cyclic include on line ${sourceLine}: ${candidate}` })
        return
      }
    } catch (_) {}

    if (bundle.files.length >= maxFiles) {
      reportLimit()
      return
    }

    let opened
    try {
      opened = readSafe.withBoundedFile(target, limit - totalBytes, roots === null ? null : { roots: roots }, function(file) {
        if (visited.has(file.path)) return { path: file.path, cycle: true, text: "" }
        return { path: file.path, cycle: false, text: file.read() }
      })
    } catch (error) {
      if (error && error.exitCode === 6) {
        if (isRoot) {
          bundle.state = "invalid"
          bundle.message = `XCompose ${error.message}`
        } else {
          bundle.diagnostics.push({ severity: "warning", code: "include-denied", message: `Included file ${error.message}` })
        }
        return
      }
      if (isRoot) {
        bundle.state = error && error.exitCode === 3 ? "missing" : (error && error.exitCode === 5 ? "too-large" : "invalid")
        bundle.message = error && error.message ? error.message : "unable to read XCompose file"
        return
      }
      const severity = error && error.exitCode === 5 ? "error" : "warning"
      const code = error && error.exitCode === 3 ? "include-missing" : "include-unreadable"
      bundle.diagnostics.push({ severity: severity, code: code, message: `${target}: ${error && error.message ? error.message : "unable to read included file"}` })
      return
    }

    const resolved = opened.path
    const text = opened.text

    if (opened.cycle) {
      if (!isRoot) bundle.diagnostics.push({ severity: "warning", code: "include-cycle", message: `Skipped cyclic include on line ${sourceLine}: ${resolved}` })
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
