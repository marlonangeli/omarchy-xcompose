var schemaVersion = 1

function empty() { return { schemaVersion: schemaVersion, entries: {} } }

function parse(raw) {
  try {
    var value = JSON.parse(String(raw || ""))
    if (!value || value.schemaVersion !== schemaVersion || !value.entries || typeof value.entries !== "object") return empty()
    var entries = {}
    Object.keys(value.entries).forEach(function(id) {
      var item = value.entries[id] || {}
      if (/^x[0-9a-f]{16}$/.test(id) && Number.isFinite(item.count) && Number.isFinite(item.lastUsed)) entries[id] = { count: Math.max(0, Math.floor(item.count)), lastUsed: Math.max(0, Math.floor(item.lastUsed)) }
    })
    return { schemaVersion: schemaVersion, entries: entries }
  } catch (_) { return empty() }
}

function record(history, id, now, limit) {
  var next = parse(JSON.stringify(history || empty()))
  var previous = next.entries[id] || { count: 0, lastUsed: 0 }
  next.entries[id] = { count: Math.min(2147483647, previous.count + 1), lastUsed: Math.max(0, Math.floor(now || Date.now())) }
  var ids = Object.keys(next.entries).sort(function(a, b) {
    var first = next.entries[b], second = next.entries[a]
    return first.lastUsed - second.lastUsed || first.count - second.count
  })
  while (ids.length > (limit || 100)) delete next.entries[ids.pop()]
  return next
}
