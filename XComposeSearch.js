function normalize(value) {
  var text = String(value || "").toLocaleLowerCase()
  try { return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "") } catch (_) { return text }
}

function compareText(a, b) { return String(a || "").localeCompare(String(b || "")) }

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

function descriptionRanges(value, query) {
  var match = matchField(normalize(value), query, 0)
  return match ? match.positions.map(function(position) { return { start: position, length: 1 } }) : []
}

function matchEntry(entry, query) {
  if (!query) return { score: 0, descriptionRanges: [] }
  var fields = [
    { value: entry.normalizedResult, weight: 50, description: false },
    { value: entry.normalizedCompactSequence, weight: 45, description: false },
    { value: entry.normalizedSequence, weight: 40, description: false },
    { value: entry.normalizedDescription, weight: 30, description: true }
  ]
  var best = null
  fields.forEach(function(field) {
    var match = matchField(field.value, query, field.weight)
    if (match && (!best || match.score > best.score)) {
      best = match
      best.descriptionRanges = field.description ? descriptionRanges(entry.description, query) : []
    }
  })
  return best
}

function historyMeta(history, id) {
  var value = history && history.entries ? history.entries[id] : null
  return value && typeof value === "object" ? value : { count: 0, lastUsed: 0 }
}

function buildGroups(entries, history) {
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
    return group
  })
}

function compareGroups(a, b) {
  if (b.score !== a.score) return b.score - a.score
  if (b.history.lastUsed !== a.history.lastUsed) return b.history.lastUsed - a.history.lastUsed
  if (b.history.count !== a.history.count) return b.history.count - a.history.count
  return compareText(a.variants[a.activeVariantIndex].description, b.variants[b.activeVariantIndex].description) || compareText(a.variants[a.activeVariantIndex].sequenceText, b.variants[b.activeVariantIndex].sequenceText)
}

function search(entries, query, history, limit) {
  var needle = normalize(query).trim()
  if (!needle) {
    return buildGroups(entries, history).map(function(group) {
      return { groupId: group.groupId, result: group.result, variants: group.variants, activeVariantIndex: 0, score: 0, history: group.history, descriptionRanges: [] }
    }).sort(compareGroups).slice(0, limit || 100)
  }

  var matchedByResult = {}
  ;(entries || []).forEach(function(entry) {
    var match = matchEntry(entry, needle)
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
    return { groupId: group.groupId, result: group.result, variants: group.variants, activeVariantIndex: active < 0 ? 0 : active, score: group.candidate.match.score, history: group.history, descriptionRanges: group.candidate.match.descriptionRanges }
  })
  return groups.sort(compareGroups).slice(0, limit || 100)
}
