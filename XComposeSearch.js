function normalize(value) {
  var text = String(value || "").toLocaleLowerCase()
  try { return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "") } catch (_) { return text }
}

function compareText(a, b) { return String(a || "").localeCompare(String(b || "")) }

var literalKeys = {
  ".": "period", ",": "comma", ":": "colon", ";": "semicolon",
  "<": "less", ">": "greater", "/": "slash", "\\": "backslash",
  "[": "bracketleft", "]": "bracketright", "{": "braceleft", "}": "braceright",
  "(": "parenleft", ")": "parenright", "-": "minus", "_": "underscore",
  "=": "equal", "+": "plus", "'": "apostrophe", "\"": "quotedbl",
  "`": "grave", "|": "bar", "!": "exclam", "?": "question",
  "@": "at", "#": "numbersign", "$": "dollar", "%": "percent",
  "^": "asciicircum", "&": "ampersand", "*": "asterisk", "~": "asciitilde"
}

function fuzzyMatch(text, needle) {
  var positions = []
  var at = 0
  for (var i = 0; i < needle.length; i++) {
    at = text.indexOf(needle[i], at)
    if (at < 0) return null
    positions.push(at++)
  }
  return positions
}

function matchField(field, query, fieldWeight) {
  if (!query) return { score: 0, positions: [] }
  var at = field.indexOf(query)
  if (at === 0 && field.length === query.length) return { score: 4000 + fieldWeight, positions: Array.from({ length: query.length }, function(_, i) { return i }) }
  if (at === 0) return { score: 3000 + fieldWeight, positions: Array.from({ length: query.length }, function(_, i) { return i }) }
  if (at >= 0) return { score: 2000 + fieldWeight - at, positions: Array.from({ length: query.length }, function(_, i) { return at + i }) }
  var fuzzy = fuzzyMatch(field, query)
  return fuzzy ? { score: 1000 + fieldWeight + fuzzy.length, positions: fuzzy } : null
}

function rangesFromPositions(positions) {
  return (positions || []).map(function(position) { return { start: position, length: 1 } })
}

function sequenceSearchField(entry, compact) {
  if (compact && entry && entry.compactSequenceTokenIndexes) return { value: entry.normalizedCompactSequence, tokenIndexes: entry.compactSequenceTokenIndexes }
  if (!compact && entry && entry.rawSequenceTokenIndexes) return { value: entry.normalizedRawSequenceText, tokenIndexes: entry.rawSequenceTokenIndexes }
  var value = ""
  var tokenIndexes = []
  var sequence = entry && entry.rawSequence ? entry.rawSequence : []
  for (var index = 0; index < sequence.length; index++) {
    if (sequence[index] === "Multi_key") continue
    var token = compact ? String(sequence[index]).replace(/[^A-Za-z0-9]/g, "") : String(sequence[index])
    if (!compact && value) { value += " "; tokenIndexes.push(-1) }
    for (var character = 0; character < token.length; character++) {
      value += token.charAt(character)
      tokenIndexes.push(index)
    }
  }
  return { value: normalize(value), tokenIndexes: tokenIndexes }
}

function sequenceTokenRanges(entry, tokenIndexes) {
  var preview = String(entry && entry.sequencePreview || "")
  var selected = {}
  ;(tokenIndexes || []).forEach(function(index) { selected[index] = true })
  var ranges = []
  var display = entry && entry.displaySequence ? entry.displaySequence : []
  var offset = 0
  for (var index = 0; index < display.length; index++) {
    var token = String(display[index])
    if (selected[index] && offset < preview.length) ranges.push({ start: offset, length: Math.min(token.length, preview.length - offset) })
    offset += token.length + 3 // " · "
  }
  return ranges
}

function composeTokenQuery(query) {
  var source = String(query || "")
  var tokens = []
  var matcher = /<([^>\s]+)>/g
  var match
  while (source.charAt(0) === " ") {
    tokens.push("space")
    source = source.substring(1)
  }
  while (source.length) {
    // Keep complete explicit tokens such as <space> intact; a bare < remains
    // the literal Less key.
    if (/^<[^>\s]+>/.test(source)) break
    var literalToken = literalKeys[source.charAt(0)]
    if (!literalToken) break
    tokens.push(literalToken)
    source = source.substring(1)
  }
  while ((match = matcher.exec(source)) !== null) tokens.push(normalize(match[1]))
  return tokens.length ? { tokens: tokens, remaining: source.replace(/<[^>\s]+>/g, " ").replace(/\s+/g, " ").trim() } : null
}

function matchComposeTokens(entry, tokens) {
  var sequence = entry && entry.rawSequence ? entry.rawSequence : []
  var at = 0
  var matchedIndexes = []
  for (var i = 0; i < tokens.length; i++) {
    var found = -1
    for (var candidate = at; candidate < sequence.length; candidate++) {
      if (normalize(sequence[candidate]) === tokens[i]) { found = candidate; break }
    }
    if (found < 0) return null
    matchedIndexes.push(found)
    at = found + 1
  }
  return { score: 5000 + tokens.length * 10, sequenceRanges: sequenceTokenRanges(entry, matchedIndexes) }
}

function matchHeuristics(entry, query) {
  if (!query) return { score: 0, descriptionRanges: [], resultRanges: [], sequenceRanges: [] }
  var rawSequence = sequenceSearchField(entry, false)
  var compactSequence = sequenceSearchField(entry, true)
  var fields = [
    { value: entry.normalizedValuePreview || normalize(entry.valuePreview || entry.result), weight: 50, target: "result" },
    { value: entry.normalizedDescriptionPreview || normalize(entry.descriptionPreview || entry.description), weight: 45, target: "description" },
    { value: rawSequence.value, weight: 30, target: "sequence", tokenIndexes: rawSequence.tokenIndexes },
    { value: compactSequence.value, weight: 25, target: "sequence", tokenIndexes: compactSequence.tokenIndexes },
    { value: entry.normalizedSequencePreview || normalize(entry.sequencePreview), weight: 20, target: "sequence" }
  ]
  var best = null
  var highlights = { descriptionRanges: [], resultRanges: [], sequenceRanges: [] }
  var highlightScores = { description: -1, result: -1, sequence: -1 }
  fields.forEach(function(field) {
    var match = matchField(field.value, query, field.weight)
    if (!match) return
    if (match.score > highlightScores[field.target]) {
      highlightScores[field.target] = match.score
      if (field.target === "description") highlights.descriptionRanges = rangesFromPositions(match.positions)
      else if (field.target === "result") highlights.resultRanges = rangesFromPositions(match.positions)
      else if (field.tokenIndexes) {
        var matchedTokens = match.positions.map(function(position) { return field.tokenIndexes[position] }).filter(function(index) { return index >= 0 })
        highlights.sequenceRanges = sequenceTokenRanges(entry, matchedTokens)
      } else highlights.sequenceRanges = rangesFromPositions(match.positions)
    }
    if (!best || match.score > best.score) {
      best = match
    }
  })
  if (!best) return null
  return { score: best.score, descriptionRanges: highlights.descriptionRanges, resultRanges: highlights.resultRanges, sequenceRanges: highlights.sequenceRanges }
}

function matchEntryWithComposeQuery(entry, query, composeQuery) {
  if (!composeQuery) return matchHeuristics(entry, query)
  var tokenMatch = matchComposeTokens(entry, composeQuery.tokens)
  if (!tokenMatch) return null
  var heuristicMatch = matchHeuristics(entry, composeQuery.remaining)
  if (!heuristicMatch && composeQuery.remaining) return null
  return {
    score: tokenMatch.score + (heuristicMatch ? heuristicMatch.score : 0),
    descriptionRanges: heuristicMatch ? heuristicMatch.descriptionRanges : [],
    resultRanges: heuristicMatch ? heuristicMatch.resultRanges : [],
    sequenceRanges: tokenMatch.sequenceRanges
  }
}

function matchEntry(entry, query) {
  return matchEntryWithComposeQuery(entry, query, composeTokenQuery(query))
}

function historyMeta(history, id) {
  var value = history && history.entries ? history.entries[id] : null
  return value && typeof value === "object" ? value : { count: 0, lastUsed: 0 }
}

function isFavorite(favorites, id) {
  return !!(favorites && favorites.ids && favorites.ids[id] === true)
}

function buildGroups(entries, history, favorites) {
  var groups = {}
  ;(entries || []).forEach(function(entry) {
    var key = entry.result
    if (!groups[key]) groups[key] = { groupId: "result:" + entry.id, result: entry.result, variants: [] }
    groups[key].variants.push(entry)
  })
  return Object.keys(groups).map(function(key) {
    var group = groups[key]
    group.variants.sort(function(a, b) { return compareText(a.description, b.description) || compareText(a.sequenceText, b.sequenceText) })
    group.history = group.variants.reduce(function(best, entry) {
      var meta = historyMeta(history, entry.id)
      return meta.lastUsed > best.lastUsed || (meta.lastUsed === best.lastUsed && meta.count > best.count) ? meta : best
    }, { count: 0, lastUsed: 0 })
    group.favorite = group.variants.some(function(entry) { return isFavorite(favorites, entry.id) })
    return group
  })
}

function compareGroups(a, b) {
  if (b.score !== a.score) return b.score - a.score
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
  if (b.history.lastUsed !== a.history.lastUsed) return b.history.lastUsed - a.history.lastUsed
  if (b.history.count !== a.history.count) return b.history.count - a.history.count
  return compareText(a.variants[a.activeVariantIndex].description, b.variants[b.activeVariantIndex].description) || compareText(a.variants[a.activeVariantIndex].sequenceText, b.variants[b.activeVariantIndex].sequenceText)
}

function search(entries, query, history, favorites, limit) {
  if (typeof favorites === "number") { limit = favorites; favorites = null }
  var needle = normalize(query)
  if (!needle) {
    return buildGroups(entries, history, favorites).map(function(group) {
      return { groupId: group.groupId, result: group.result, variants: group.variants, activeVariantIndex: 0, score: 0, history: group.history, favorite: group.favorite, descriptionRanges: [] }
    }).sort(compareGroups).slice(0, limit || 100)
  }

  var composeQuery = composeTokenQuery(needle)
  var matchedByResult = {}
  ;(entries || []).forEach(function(entry) {
    var match = matchEntryWithComposeQuery(entry, needle, composeQuery)
    if (!match) return
    var candidate = { entry: entry, match: match, meta: historyMeta(history, entry.id) }
    var current = matchedByResult[entry.result]
    if (!current || candidate.match.score > current.match.score || (candidate.match.score === current.match.score && candidate.meta.lastUsed > current.meta.lastUsed)) matchedByResult[entry.result] = candidate
  })

  var groupsByResult = {}
  Object.keys(matchedByResult).forEach(function(result) {
    var candidate = matchedByResult[result]
    groupsByResult[result] = { groupId: "result:" + candidate.entry.id, result: result, variants: [], candidate: candidate }
  })
  ;(entries || []).forEach(function(entry) { if (groupsByResult[entry.result]) groupsByResult[entry.result].variants.push(entry) })

  var groups = Object.keys(groupsByResult).map(function(result) {
    var group = groupsByResult[result]
    group.variants.sort(function(a, b) { return compareText(a.description, b.description) || compareText(a.sequenceText, b.sequenceText) })
    var active = group.variants.indexOf(group.candidate.entry)
    group.history = group.variants.reduce(function(best, entry) {
      var meta = historyMeta(history, entry.id)
      return meta.lastUsed > best.lastUsed || (meta.lastUsed === best.lastUsed && meta.count > best.count) ? meta : best
    }, { count: 0, lastUsed: 0 })
    group.favorite = group.variants.some(function(entry) { return isFavorite(favorites, entry.id) })
    return { groupId: group.groupId, result: group.result, variants: group.variants, activeVariantIndex: active < 0 ? 0 : active, score: group.candidate.match.score, history: group.history, favorite: group.favorite, descriptionRanges: group.candidate.match.descriptionRanges }
  })
  return groups.sort(compareGroups).slice(0, limit || 100)
}
