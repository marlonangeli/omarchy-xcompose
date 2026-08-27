var schemaVersion = 1

function empty() { return { schemaVersion: schemaVersion, ids: {} } }

function parse(raw) {
  try {
    var value = JSON.parse(String(raw || ""))
    if (!value || value.schemaVersion !== schemaVersion || !value.ids || typeof value.ids !== "object") return empty()
    var ids = {}
    Object.keys(value.ids).forEach(function(id) {
      if (/^x[0-9a-f]{16}$/.test(id) && value.ids[id] === true) ids[id] = true
    })
    return { schemaVersion: schemaVersion, ids: ids }
  } catch (_) { return empty() }
}

function isFavorite(favorites, id) {
  return !!(favorites && favorites.ids && favorites.ids[id] === true)
}

function toggle(favorites, id, limit) {
  if (!/^x[0-9a-f]{16}$/.test(String(id || ""))) return parse(JSON.stringify(favorites || empty()))
  var next = parse(JSON.stringify(favorites || empty()))
  if (next.ids[id]) delete next.ids[id]
  else {
    var ids = Object.keys(next.ids)
    if (ids.length >= (limit || 100)) return next
    next.ids[id] = true
  }
  return next
}
