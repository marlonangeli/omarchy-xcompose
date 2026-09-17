function normalize(value) {
  var text = String(value || "").toLowerCase()
  if (text.length < 256 && !/[^\x00-\x7f]/.test(text)) return text
  try { return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "") } catch (_) { return text }
}

var maxSourceLength = 1024 * 1024
var maxSourceBytes = maxSourceLength
var maxEntries = 5000
var maxResultLength = 4096
var maxMetadataName = 120
var maxMetadataTags = 8
var maxMetadataAliases = 8
var maxMetadataItem = 64

function exceedsSourceLimit(raw) { return String(raw || "").length > maxSourceLength }

function emptyCommentMeta() {
  return { description: "", name: "", tags: [], aliases: [], sensitive: false }
}

function sanitizeMetadataItem(value, limit) {
  var text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim()
  return Array.from(text).slice(0, limit == null ? maxMetadataItem : limit).join("")
}

function splitMetadataList(value) {
  var output = []
  var parts = String(value || "").split(/[,;]/)
  for (var index = 0; index < parts.length; index++) {
    var item = sanitizeMetadataItem(parts[index])
    if (item) output.push(item)
  }
  return output
}

function dedupeMetadataList(items) {
  var output = []
  var seen = Object.create(null)
  for (var index = 0; index < (items || []).length; index++) {
    var item = items[index]
    var key = item.toLocaleLowerCase()
    if (seen[key]) continue
    seen[key] = true
    output.push(item)
  }
  return output
}

function parseCommentMeta(comment, line, diagnostics) {
  var text = String(comment || "").trim()
  var meta = emptyCommentMeta()
  var pattern = /@([A-Za-z][A-Za-z0-9_-]*)/g
  var matches = []
  var match
  while ((match = pattern.exec(text)) !== null) matches.push({ key: match[1].toLocaleLowerCase(), start: match.index, end: pattern.lastIndex })
  if (!matches.length) {
    meta.description = text
    return meta
  }
  var description = text.substring(0, matches[0].start)
  for (var index = 0; index < matches.length; index++) {
    var current = matches[index]
    var nextStart = index + 1 < matches.length ? matches[index + 1].start : text.length
    var value = text.substring(current.end, nextStart).replace(/^\s*:?\s*/, "").trim()
    if (current.key === "name") meta.name = sanitizeMetadataItem(value, maxMetadataName)
    else if (current.key === "tag" || current.key === "tags") meta.tags = meta.tags.concat(splitMetadataList(value))
    else if (current.key === "alias" || current.key === "aliases") meta.aliases = meta.aliases.concat(splitMetadataList(value))
    else if (current.key === "sensitive") {
      meta.sensitive = true
      if (value) description += " " + value
    } else {
      diagnostics.push({ severity: "warning", line: line, code: "unknown-directive", message: "Unknown directive: @" + current.key })
      description += " " + text.substring(current.start, nextStart).trim()
    }
  }
  meta.description = description.replace(/\s+/g, " ").trim()
  return meta
}

function mergeCommentMeta(base, extra) {
  return {
    description: extra.description ? (base.description ? base.description + " " + extra.description : extra.description) : base.description,
    name: extra.name || base.name,
    tags: base.tags.concat(extra.tags),
    aliases: base.aliases.concat(extra.aliases),
    sensitive: base.sensitive || extra.sensitive
  }
}

function compactPreview(value, limit) {
  var text = String(value || "")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/\n/g, " ↵ ").replace(/\t/g, " ⇥ ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "�")
    .replace(/\s+/g, " ").trim()
  if (!text) text = "(whitespace)"
  var characters = Array.from(text)
  return characters.length <= limit ? text : characters.slice(0, Math.max(0, limit - 1)).join("") + "…"
}

function hash32(value, seed) {
  var hash = seed >>> 0
  var text = String(value || "")
  for (var index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0
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

function detectSequenceConflicts(entries, diagnostics) {
  var bySequence = Object.create(null)
  ;(entries || []).forEach(function(entry) {
    var key = entry.rawSequence.join("\u001f")
    if (!bySequence[key]) bySequence[key] = entry
    else diagnostics.push({ severity: bySequence[key].result === entry.result ? "warning" : "error", line: entry.line, relatedLine: bySequence[key].line, code: bySequence[key].result === entry.result ? "duplicate-sequence" : "conflicting-sequence", message: bySequence[key].result === entry.result ? "Duplicate compose sequence first defined on line " + bySequence[key].line : "Compose sequence conflicts with line " + bySequence[key].line })
  })
}

function parse(raw, source, options) {
  var text = String(raw || "")
  if (text.length > maxSourceLength) return { entries: [], diagnostics: [{ severity: "error", line: 0, code: "source-too-large", message: "XCompose file exceeds " + maxSourceLength + " characters" }], includes: [] }
  var lines = text.split(/\r?\n/)
  var entries = []
  var diagnostics = []
  var activeMeta = emptyCommentMeta()
  var pendingMeta = null
  var includes = []
  for (var i = 0; i < lines.length; i++) {
    var line = i + 1
    var trimmed = lines[i].trim()
    if (!trimmed) { activeMeta = emptyCommentMeta(); pendingMeta = null; continue }
    if (trimmed.charAt(0) === "#") {
      pendingMeta = mergeCommentMeta(pendingMeta || emptyCommentMeta(), parseCommentMeta(trimmed.substring(1).trim(), line, diagnostics))
      continue
    }
    if (/^include\s+/.test(trimmed)) { includes.push({ line: line, value: trimmed }); activeMeta = emptyCommentMeta(); pendingMeta = null; continue }
    if (pendingMeta) { activeMeta = pendingMeta; pendingMeta = null }
    var colon = trimmed.indexOf(":")
    if (colon < 0) {
      diagnostics.push({ severity: "warning", line: line, code: "missing-colon", message: "Ignored line without an XCompose separator" })
      activeMeta = emptyCommentMeta()
      continue
    }
    var rawSequence = parseSequence(trimmed.substring(0, colon).trim())
    if (!rawSequence.length) {
      diagnostics.push({ severity: "warning", line: line, code: "invalid-sequence", message: "Ignored rule without key symbols" })
      activeMeta = emptyCommentMeta()
      continue
    }
    var result = parseResult(trimmed.substring(colon + 1), line, diagnostics)
    if (!result) continue
    var inlineMeta = parseCommentMeta(result.inlineComment, line, diagnostics)
    var sensitive = activeMeta.sensitive || inlineMeta.sensitive
    var description = inlineMeta.description || activeMeta.description || (sensitive ? "(sensitive)" : compactPreview(result.value, 160))
    var name = inlineMeta.name || activeMeta.name || description
    var tags = dedupeMetadataList(activeMeta.tags.concat(inlineMeta.tags)).slice(0, maxMetadataTags)
    if (activeMeta.tags.concat(inlineMeta.tags).length > maxMetadataTags) diagnostics.push({ severity: "warning", line: line, code: "metadata-limit", message: "Kept at most " + maxMetadataTags + " tags" })
    var aliases = dedupeMetadataList(activeMeta.aliases.concat(inlineMeta.aliases)).slice(0, maxMetadataAliases)
    if (activeMeta.aliases.concat(inlineMeta.aliases).length > maxMetadataAliases) diagnostics.push({ severity: "warning", line: line, code: "metadata-limit", message: "Kept at most " + maxMetadataAliases + " aliases" })
    var displaySequence = rawSequence.map(displayKey)
    var sequenceText = displaySequence.join(" · ")
    var rawSequenceText = rawSequence.filter(function(key) { return key !== "Multi_key" }).join(" ")
    var compactSequence = rawSequence.filter(function(key) { return key !== "Multi_key" }).map(function(key) { return key.replace(/[^A-Za-z0-9]/g, "") }).join("")
    var descriptionPreview = compactPreview(name, 120)
    var valuePreview = compactPreview(result.value, 80)
    var sequencePreview = compactPreview(sequenceText, 120)
    var id = opaqueId(rawSequence.join("\u001f") + "\u001e" + result.value)
    if (entries.length >= maxEntries) {
      diagnostics.push({ severity: "warning", line: line, code: "entry-limit", message: "Ignored rules after " + maxEntries + " entries" })
      break
    }
    entries.push({ id: id, description: description, name: name, tags: tags, aliases: aliases, sensitive: sensitive, result: result.value, value: result.value, rawSequence: rawSequence, displaySequence: displaySequence, sequenceText: sequenceText, rawSequenceText: rawSequenceText, compactSequence: compactSequence, source: source || "", line: line, descriptionPreview: descriptionPreview, valuePreview: valuePreview, sequencePreview: sequencePreview, rawSequenceTokenIndexes: sequenceTokenIndexes(rawSequence, false), compactSequenceTokenIndexes: sequenceTokenIndexes(rawSequence, true), normalizedAliases: normalize(aliases.join(" ")), normalizedTags: normalize(tags.join(" ")), tagList: tags.map(normalize), normalizedDescription: normalize(description), normalizedDescriptionPreview: normalize(descriptionPreview), normalizedResult: normalize(result.value), normalizedValuePreview: normalize(valuePreview), normalizedRawSequenceText: normalize(rawSequenceText), normalizedCompactSequence: normalize(compactSequence), normalizedSequencePreview: normalize(sequencePreview), normalizedSequence: normalize(rawSequenceText + " " + compactSequence + " " + sequenceText) })
  }
  if (!options || options.skipConflicts !== true) detectSequenceConflicts(entries, diagnostics)
  return { entries: entries, diagnostics: diagnostics, includes: includes }
}

function parseBundle(bundle) {
  var files = bundle && Array.isArray(bundle.files) ? bundle.files : []
  var entries = []
  var diagnostics = []
  var includes = []
  for (var index = 0; index < files.length; index++) {
    var file = files[index]
    if (!file || typeof file.text !== "string") continue
    var parsed = parse(file.text, file.path, { skipConflicts: true })
    entries = entries.concat(parsed.entries)
    diagnostics = diagnostics.concat(parsed.diagnostics)
    includes = includes.concat(parsed.includes)
    if (entries.length >= maxEntries) {
      entries = entries.slice(0, maxEntries)
      diagnostics.push({ severity: "warning", line: 0, code: "entry-limit", message: "Ignored rules after " + maxEntries + " entries" })
      break
    }
  }
  detectSequenceConflicts(entries, diagnostics)
  return { entries: entries, diagnostics: diagnostics, includes: includes }
}

function filter(entries, query, limit) {
  var needle = normalize(query).trim()
  return (entries || []).filter(function(entry) { return !needle || (entry.normalizedDescription + " " + entry.normalizedResult + " " + entry.normalizedSequence).indexOf(needle) >= 0 }).slice(0, limit || 100)
}
