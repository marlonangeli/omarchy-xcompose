function normalize(value) {
  var text = String(value || "").toLocaleLowerCase()
  try { return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "") } catch (_) { return text }
}

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
  if (key === "Multi_key") return "Caps"
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

function parseResult(rhs, line, diagnostics) {
  var parts = splitInlineComment(rhs)
  var match = parts.value.match(/^"((?:\\.|[^"\\])*)"(?:\s+\S+)?\s*$/)
  if (!match) {
    diagnostics.push({ severity: "warning", line: line, code: "invalid-result", message: "Expected a quoted XCompose result" })
    return null
  }
  return { value: decodeEscapes(match[1], line, diagnostics), inlineComment: parts.comment }
}

function parse(raw, source) {
  var lines = String(raw || "").split(/\r?\n/)
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
    if (/^include\s+/.test(trimmed)) { includes.push({ line: line, value: trimmed }); comments = []; activeDescription = ""; continue }
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
    var id = opaqueId(rawSequence.join("\u001f") + "\u001e" + result.value)
    entries.push({ id: id, description: description, result: result.value, value: result.value, rawSequence: rawSequence, displaySequence: displaySequence, sequenceText: sequenceText, rawSequenceText: rawSequenceText, compactSequence: compactSequence, source: source || "", line: line, descriptionPreview: compactPreview(description, 120), valuePreview: compactPreview(result.value, 80), sequencePreview: compactPreview(sequenceText, 120), normalizedDescription: normalize(description), normalizedResult: normalize(result.value), normalizedCompactSequence: normalize(compactSequence), normalizedSequence: normalize(rawSequenceText + " " + compactSequence + " " + sequenceText) })
  }
  var bySequence = {}
  entries.forEach(function(entry) {
    var key = entry.rawSequence.join("\u001f")
    if (!bySequence[key]) bySequence[key] = entry
    else diagnostics.push({ severity: bySequence[key].result === entry.result ? "warning" : "error", line: entry.line, code: bySequence[key].result === entry.result ? "duplicate-sequence" : "conflicting-sequence", message: bySequence[key].result === entry.result ? "Duplicate compose sequence" : "Compose sequence produces more than one result" })
  })
  return { entries: entries, diagnostics: diagnostics, includes: includes }
}

function filter(entries, query, limit) {
  var needle = normalize(query).trim()
  return (entries || []).filter(function(entry) { return !needle || (entry.normalizedDescription + " " + entry.normalizedResult + " " + entry.normalizedSequence).indexOf(needle) >= 0 }).slice(0, limit || 100)
}
