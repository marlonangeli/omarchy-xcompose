"use strict"

const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { readBounded } = require("./read-bounded")

function loadParser() {
  const parserPath = path.resolve(__dirname, "..", "XComposeParser.js")
  const context = { console }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(parserPath, "utf8"), context, { filename: parserPath })
  return context
}

function walkDiagnostic(code, message, source, line) {
  return { severity: "warning", line: line || 0, source: source || "", code: code, message: message }
}

function resolveLocaleCompose(parser, env, maxBytes) {
  const localeDir = env.XLOCALEDIR || "/usr/share/X11/locale"
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || "C"
  const composeDirPath = path.join(localeDir, "compose.dir")
  const composeDir = readBounded(composeDirPath, maxBytes)
  if (composeDir.status === 0) {
    const relative = parser.lookupComposeDir(composeDir.stdout.toString("utf8"), locale)
    if (relative) return path.isAbsolute(relative) ? relative : path.join(localeDir, relative)
  }
  const aliases = parser.localeAliases(locale)
  for (const alias of aliases) {
    const candidate = path.join(localeDir, alias, "Compose")
    try {
      if (fs.lstatSync(candidate).isFile()) return candidate
    } catch (_) {}
  }
  return path.join(localeDir, "en_US.UTF-8", "Compose")
}

function segmentText(lines, start, end) {
  if (end <= start) return ""
  return "\n".repeat(start) + lines.slice(start, end).join("\n")
}

function loadTree(rootPath, options) {
  const opts = options || {}
  const env = opts.env || process.env
  const parser = opts.parser || loadParser()
  const maxBytes = Number.isSafeInteger(opts.maxBytes) ? opts.maxBytes : parser.maxSourceLength
  const maxDepth = Number.isSafeInteger(opts.maxDepth) ? opts.maxDepth : parser.maxIncludeDepth
  const maxFiles = Number.isSafeInteger(opts.maxFiles) ? opts.maxFiles : parser.maxIncludeFiles
  const maxTotalBytes = Number.isSafeInteger(opts.maxTotalBytes) ? opts.maxTotalBytes : maxBytes * 4
  const home = env.HOME || ""
  const localeDir = env.XLOCALEDIR || "/usr/share/X11/locale"
  const localeCompose = resolveLocaleCompose(parser, env, maxBytes)
  const subst = { H: home, L: localeCompose, S: localeDir }
  const files = []
  const diagnostics = []
  const seen = Object.create(null)
  let totalBytes = 0
  let fileCount = 0

  function pushSegment(targetPath, text) {
    if (!text || !text.trim()) return
    files.push({ path: targetPath, text: text })
  }

  function walk(targetPath, depth, fromSource, fromLine) {
    if (!targetPath) {
      diagnostics.push(walkDiagnostic("include-unresolved", "Include path expanded to an empty location", fromSource, fromLine))
      return
    }
    if (seen[targetPath]) {
      if (depth > 0) diagnostics.push(walkDiagnostic("include-cycle", "Skipped already-indexed include " + targetPath, fromSource, fromLine))
      return
    }
    if (depth > maxDepth) {
      diagnostics.push(walkDiagnostic("include-depth", "Skipped include deeper than " + maxDepth + " levels", fromSource, fromLine))
      return
    }
    if (fileCount >= maxFiles) {
      diagnostics.push(walkDiagnostic("include-limit", "Ignored includes after " + maxFiles + " files", fromSource, fromLine))
      return
    }

    const read = readBounded(targetPath, maxBytes)
    if (read.status !== 0) {
      if (depth === 0) return { status: read.status, stderr: read.stderr }
      const reason = read.stderr ? read.stderr.replace(/^read-bounded:\s*/, "").trim() : "unreadable include"
      diagnostics.push(walkDiagnostic("include-unreadable", "Skipped include " + targetPath + ": " + reason, fromSource, fromLine))
      return
    }
    if (totalBytes + read.stdout.length > maxTotalBytes) {
      diagnostics.push(walkDiagnostic("include-total-size", "Skipped include " + targetPath + ": combined sources exceed " + maxTotalBytes + " bytes", fromSource, fromLine))
      return
    }

    seen[targetPath] = true
    fileCount += 1
    totalBytes += read.stdout.length
    const lines = read.stdout.toString("utf8").split(/\r?\n/)
    let segmentStart = 0

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (!/^include\s+/.test(trimmed)) continue
      pushSegment(targetPath, segmentText(lines, segmentStart, i))
      const quoted = parser.parseIncludeDirective(trimmed)
      if (!quoted) {
        diagnostics.push(walkDiagnostic("invalid-include", "Ignored include without a quoted path", targetPath, i + 1))
        segmentStart = i + 1
        continue
      }
      const expanded = parser.expandIncludeTemplate(quoted, subst)
      const resolved = path.isAbsolute(expanded) ? expanded : path.join(path.dirname(targetPath), expanded)
      const nested = walk(resolved, depth + 1, targetPath, i + 1)
      if (nested && nested.status) return nested
      segmentStart = i + 1
    }
    pushSegment(targetPath, segmentText(lines, segmentStart, lines.length))
  }

  const root = walk(rootPath, 0, "", 0)
  if (root && root.status) return { status: root.status, stderr: root.stderr, root: rootPath, files: [], diagnostics: [] }
  return { status: 0, stderr: "", root: rootPath, files: files, diagnostics: diagnostics, parser: parser }
}

function indexCompose(rootPath, options) {
  const tree = loadTree(rootPath, options)
  if (tree.status !== 0) return tree
  const parser = tree.parser
  const parsedFiles = []
  const extra = tree.diagnostics.slice()
  for (const file of tree.files) {
    if (parser.exceedsSourceLimit(file.text)) {
      extra.push(walkDiagnostic("source-too-large", "Included XCompose file is too large to index: " + file.path, file.path, 0))
      continue
    }
    parsedFiles.push(parser.parse(file.text, file.path))
  }
  const parsed = parser.combine(parsedFiles)
  parsed.diagnostics = extra.concat(parsed.diagnostics)
  return { status: 0, stderr: "", root: tree.root, files: tree.files, parsed: parsed }
}

module.exports = { loadParser, loadTree, indexCompose, resolveLocaleCompose }
