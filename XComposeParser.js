function normalize(value) {
  var text = String(value || "").toLocaleLowerCase()
  try { return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "") } catch (_) { return text }
}

var maxSourceLength = 1024 * 1024
var maxEntries = 20000
var maxResultLength = 4096
var maxIncludeDepth = 8
var maxIncludeFiles = 32

function exceedsSourceLimit(raw) { return String(raw || "").length > maxSourceLength }

function compactPreview(value, limit) {
  var text = String(value || "")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/\n/g, " ↵ ").replace(/\t/g, " ⇥ ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "�")
    .replace(/\s+/g, " ").trim()
  if (!text) text = "(whitespace)"
  return text.length <= limit ? text : text.substring(0, Math.max(0, limit - 1)) + "…"
}

function hash32(value, seed) {
  var hash = seed >>> 0
  var text = String(value || "")
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return ("00000000" + hash.toString(16)).slice(-8)
}

function opaqueId(value) {
  return "x" + hash32(value, 0x811c9dc5) + hash32(value, 0x9e3779b9)
}

function decodeEscapes(value, line, diagnostics) {
  var output = ""
  for (var i = 0; i < value.length; i++) {
    var character = value[i]
    if (character !== "\\") { output += character; continue }
    if (i + 1 >= value.length) {
      diagnostics.push({ severity: "warning", line: line, code: "trailing-escape", message: "Trailing escape preserved literally" })
      output += "\\"
      continue
    }
    var escaped = value[++i]
    var fixed = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", a: "\u0007", "\"": "\"", "\\": "\\" }
    if (Object.prototype.hasOwnProperty.call(fixed, escaped)) { output += fixed[escaped]; continue }
    var remaining = value.substring(i + 1)
    var match = null
    if (escaped === "x") match = remaining.match(/^([0-9a-fA-F]{2,6})/)
    else if (escaped === "u") match = remaining.match(/^([0-9a-fA-F]{4})/)
    else if (escaped === "U") match = remaining.match(/^([0-9a-fA-F]{8})/)
    else if (/[0-7]/.test(escaped)) match = (escaped + remaining).match(/^([0-7]{1,3})/)
    if (match) {
      var number = parseInt(match[1], escaped === "x" || escaped === "u" || escaped === "U" ? 16 : 8)
      if (number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)) output += String.fromCodePoint(number)
      else {
        diagnostics.push({ severity: "warning", line: line, code: "invalid-codepoint", message: "Invalid escaped code point preserved literally" })
        output += "\\" + escaped + match[1]
      }
      i += escaped === "x" || escaped === "u" || escaped === "U" ? match[1].length : match[1].length - 1
      continue
    }
    diagnostics.push({ severity: "warning", line: line, code: "unknown-escape", message: "Unknown escape preserved literally: \\" + escaped })
    output += "\\" + escaped
  }
  return output
}

function splitInlineComment(value) {
  var quoted = false
  var escaped = false
  for (var i = 0; i < value.length; i++) {
    var character = value[i]
    if (escaped) { escaped = false; continue }
    if (character === "\\") { escaped = true; continue }
    if (character === "\"") { quoted = !quoted; continue }
    if (character === "#" && !quoted) return { value: value.substring(0, i).trim(), comment: value.substring(i + 1).trim() }
  }
  return { value: value.trim(), comment: "" }
}

function displayKey(key) {
  if (key === "Multi_key") return "Key"
  var display = key.replace(/^KP_/, "").replace(/_/g, " ")
  return display.charAt(0).toUpperCase() + display.substring(1)
}

function parseSequence(lhs) {
  var raw = []
  var regex = /<([^>\s]+)>/g
  var match
  while ((match = regex.exec(lhs)) !== null) raw.push(match[1])
  return raw
}

function sequenceTokenIndexes(sequence, compact) {
  var indexes = []
  var hasToken = false
  for (var index = 0; index < sequence.length; index++) {
    if (sequence[index] === "Multi_key") continue
    var token = compact ? String(sequence[index]).replace(/[^A-Za-z0-9]/g, "") : String(sequence[index])
    if (!compact && hasToken) indexes.push(-1)
    for (var character = 0; character < token.length; character++) indexes.push(index)
    hasToken = true
  }
  return indexes
}

function parseIncludeDirective(trimmed) {
  var match = String(trimmed || "").match(/^include\s+"((?:\\.|[^"\\])*)"\s*$/)
  return match ? match[1] : null
}

function expandIncludeTemplate(quoted, subst) {
  var text = String(quoted || "")
  var values = subst || {}
  var output = ""
  for (var i = 0; i < text.length; i++) {
    if (text.charAt(i) !== "%") { output += text.charAt(i); continue }
    var next = text.charAt(i + 1)
    if (next === "%") { output += "%"; i++; continue }
    if (next === "H" && values.H != null) { output += values.H; i++; continue }
    if (next === "L" && values.L != null) { output += values.L; i++; continue }
    if (next === "S" && values.S != null) { output += values.S; i++; continue }
    output += "%"
  }
  return output
}

function localeAliases(locale) {
  var name = String(locale || "C").trim()
  if (!name) name = "C"
  var aliases = [name]
  if (/utf8$/i.test(name) && aliases.indexOf(name.replace(/utf8$/i, "UTF-8")) < 0) aliases.push(name.replace(/utf8$/i, "UTF-8"))
  if (/UTF-8$/.test(name) && aliases.indexOf(name.replace(/UTF-8$/, "utf8")) < 0) aliases.push(name.replace(/UTF-8$/, "utf8"))
  var base = name.split(".")[0]
  if (base && aliases.indexOf(base) < 0) aliases.push(base)
  if (aliases.indexOf("C.UTF-8") < 0) aliases.push("C.UTF-8")
  if (aliases.indexOf("C") < 0) aliases.push("C")
  return aliases
}

function lookupComposeDir(composeDirText, locale) {
  var wanted = localeAliases(locale)
  var lines = String(composeDirText || "").split(/\r?\n/)
  for (var w = 0; w < wanted.length; w++) {
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      if (!line || line.charAt(0) === "#") continue
      var parts = line.split(/\s+/)
      if (parts.length >= 2 && parts[1] === wanted[w]) return parts[0]
    }
  }
  return ""
}

function sequenceKey(entry) {
  return (entry && entry.rawSequence ? entry.rawSequence : []).join("\u001f")
}

function combine(parsedList) {
  var entries = []
  var diagnostics = []
  var includes = []
  var list = parsedList || []
  for (var i = 0; i < list.length; i++) {
    var parsed = list[i] || {}
    var parsedEntries = parsed.entries || []
    var parsedDiagnostics = parsed.diagnostics || []
    var parsedIncludes = parsed.includes || []
    for (var e = 0; e < parsedEntries.length; e++) entries.push(parsedEntries[e])
    for (var d = 0; d < parsedDiagnostics.length; d++) diagnostics.push(parsedDiagnostics[d])
    for (var n = 0; n < parsedIncludes.length; n++) includes.push(parsedIncludes[n])
  }
  var bySequence = Object.create(null)
  var kept = []
  for (var index = 0; index < entries.length; index++) {
    var entry = entries[index]
    var key = sequenceKey(entry)
    if (!bySequence[key]) {
      bySequence[key] = entry
      kept.push(entry)
      continue
    }
    if (bySequence[key].source === entry.source) {
      kept.push(entry)
      continue
    }
    var earlier = bySequence[key]
    var same = earlier.result === entry.result
    var origin = earlier.source ? " of " + earlier.source : ""
    diagnostics.push({
      severity: "warning",
      line: entry.line,
      source: entry.source || "",
      relatedLine: earlier.line,
      relatedSource: earlier.source || "",
      code: same ? "duplicate-sequence" : "overridden-sequence",
      message: same
        ? "Duplicate compose sequence first defined on line " + earlier.line + origin
        : "Compose sequence overrides line " + earlier.line + origin
    })
    var previous = kept.indexOf(earlier)
    if (previous >= 0) kept[previous] = entry
    bySequence[key] = entry
  }
  entries = kept
  if (entries.length > maxEntries) {
    diagnostics.push({ severity: "warning", line: 0, source: "", code: "entry-limit", message: "Ignored rules after " + maxEntries + " entries" })
    entries = entries.slice(0, maxEntries)
  }
  return { entries: entries, diagnostics: diagnostics, includes: includes }
}

function parseResult(rhs, line, diagnostics) {
  var parts = splitInlineComment(rhs)
  var match = parts.value.match(/^"((?:\\.|[^"\\])*)"(?:\s+\S+)?\s*$/)
  if (!match) {
    diagnostics.push({ severity: "warning", line: line, code: "invalid-result", message: "Expected a quoted XCompose result" })
    return null
  }
  if (match[1].length > maxResultLength) {
    diagnostics.push({ severity: "warning", line: line, code: "result-too-long", message: "Ignored result longer than " + maxResultLength + " characters" })
    return null
  }
  var value = decodeEscapes(match[1], line, diagnostics)
  if (value.length > maxResultLength) {
    diagnostics.push({ severity: "warning", line: line, code: "result-too-long", message: "Ignored result longer than " + maxResultLength + " characters" })
    return null
  }
  return { value: value, inlineComment: parts.comment }
}

function parse(raw, source) {
  var text = String(raw || "")
  if (text.length > maxSourceLength) return { entries: [], diagnostics: [{ severity: "error", line: 0, code: "source-too-large", message: "XCompose file exceeds " + maxSourceLength + " characters" }], includes: [] }
  var lines = text.split(/\r?\n/)
  var entries = []
  var diagnostics = []
  var comments = []
  var activeDescription = ""
  var includes = []
  for (var i = 0; i < lines.length; i++) {
    var line = i + 1
    var trimmed = lines[i].trim()
    if (!trimmed) { comments = []; activeDescription = ""; continue }
    if (trimmed.charAt(0) === "#") { comments.push(trimmed.substring(1).trim()); continue }
    if (/^include\s+/.test(trimmed)) {
      var quoted = parseIncludeDirective(trimmed)
      includes.push({ line: line, value: trimmed, quoted: quoted || "" })
      if (!quoted) diagnostics.push({ severity: "warning", line: line, source: source || "", code: "invalid-include", message: "Ignored include without a quoted path" })
      comments = []
      activeDescription = ""
      continue
    }
    if (comments.length) { activeDescription = comments.filter(Boolean).join(" "); comments = [] }
    var colon = trimmed.indexOf(":")
    if (colon < 0) {
      diagnostics.push({ severity: "warning", line: line, code: "missing-colon", message: "Ignored line without an XCompose separator" })
      activeDescription = ""
      continue
    }
    var rawSequence = parseSequence(trimmed.substring(0, colon).trim())
    if (!rawSequence.length) {
      diagnostics.push({ severity: "warning", line: line, code: "invalid-sequence", message: "Ignored rule without key symbols" })
      activeDescription = ""
      continue
    }
    var result = parseResult(trimmed.substring(colon + 1), line, diagnostics)
    if (!result) continue
    var displaySequence = rawSequence.map(displayKey)
    var sequenceText = displaySequence.join(" · ")
    var rawSequenceText = rawSequence.filter(function(key) { return key !== "Multi_key" }).join(" ")
    var compactSequence = rawSequence.filter(function(key) { return key !== "Multi_key" }).map(function(key) { return key.replace(/[^A-Za-z0-9]/g, "") }).join("")
    var description = result.inlineComment || activeDescription || compactPreview(result.value, 160)
    var descriptionPreview = compactPreview(description, 120)
    var valuePreview = compactPreview(result.value, 80)
    var sequencePreview = compactPreview(sequenceText, 120)
    var id = opaqueId(rawSequence.join("\u001f") + "\u001e" + result.value)
    if (entries.length >= maxEntries) {
      diagnostics.push({ severity: "warning", line: line, code: "entry-limit", message: "Ignored rules after " + maxEntries + " entries" })
      break
    }
    entries.push({ id: id, description: description, result: result.value, value: result.value, rawSequence: rawSequence, displaySequence: displaySequence, sequenceText: sequenceText, rawSequenceText: rawSequenceText, compactSequence: compactSequence, source: source || "", line: line, descriptionPreview: descriptionPreview, valuePreview: valuePreview, sequencePreview: sequencePreview, rawSequenceTokenIndexes: sequenceTokenIndexes(rawSequence, false), compactSequenceTokenIndexes: sequenceTokenIndexes(rawSequence, true), normalizedDescription: normalize(description), normalizedDescriptionPreview: normalize(descriptionPreview), normalizedResult: normalize(result.value), normalizedValuePreview: normalize(valuePreview), normalizedRawSequenceText: normalize(rawSequenceText), normalizedCompactSequence: normalize(compactSequence), normalizedSequencePreview: normalize(sequencePreview), normalizedSequence: normalize(rawSequenceText + " " + compactSequence + " " + sequenceText) })
  }
  var bySequence = Object.create(null)
  entries.forEach(function(entry) {
    var key = entry.rawSequence.join("\u001f")
    if (!bySequence[key]) bySequence[key] = entry
    else diagnostics.push({ severity: bySequence[key].result === entry.result ? "warning" : "error", line: entry.line, relatedLine: bySequence[key].line, code: bySequence[key].result === entry.result ? "duplicate-sequence" : "conflicting-sequence", message: bySequence[key].result === entry.result ? "Duplicate compose sequence first defined on line " + bySequence[key].line : "Compose sequence conflicts with line " + bySequence[key].line })
  })
  return { entries: entries, diagnostics: diagnostics, includes: includes }
}

function filter(entries, query, limit) {
  var needle = normalize(query).trim()
  return (entries || []).filter(function(entry) { return !needle || (entry.normalizedDescription + " " + entry.normalizedResult + " " + entry.normalizedSequence).indexOf(needle) >= 0 }).slice(0, limit || 100)
}
