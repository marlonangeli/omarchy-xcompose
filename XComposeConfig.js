var schemaVersion = 1
var maxConfigLength = 64 * 1024
var maxPathLength = 4096
var maxListItems = 32
var maxResultsLimit = 500
var defaultResults = 100

function empty() {
  return {
    schemaVersion: schemaVersion,
    compose: { path: "", sources: [] },
    includes: { enabled: false, roots: [] },
    search: { fuzzy: true, maxResults: defaultResults },
    ui: { showTags: true, showSource: true, maskSensitive: true },
    insert: { clearClipboardAfterPaste: true },
    security: { allowExternalPaths: false, allowedRoots: [] }
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function diagnostic(severity, code, message) {
  return { severity: severity, code: code, message: message }
}

function readString(object, section, key, fallback, diagnostics) {
  if (!Object.prototype.hasOwnProperty.call(object, key)) return fallback
  var value = object[key]
  if (typeof value !== "string") {
    diagnostics.push(diagnostic("warning", "config-type", "config." + section + "." + key + " must be a string; using default"))
    return fallback
  }
  var text = value.trim()
  if (text.length > maxPathLength) {
    diagnostics.push(diagnostic("warning", "config-too-long", "config." + section + "." + key + " exceeds " + maxPathLength + " characters; using default"))
    return fallback
  }
  return text
}

function readBool(object, section, key, fallback, diagnostics) {
  if (!Object.prototype.hasOwnProperty.call(object, key)) return fallback
  var value = object[key]
  if (typeof value !== "boolean") {
    diagnostics.push(diagnostic("warning", "config-type", "config." + section + "." + key + " must be a boolean; using default"))
    return fallback
  }
  return value
}

function readInt(object, section, key, fallback, minimum, maximum, diagnostics) {
  if (!Object.prototype.hasOwnProperty.call(object, key)) return fallback
  var value = object[key]
  if (typeof value !== "number" || !Number.isFinite(value) || Math.floor(value) !== value) {
    diagnostics.push(diagnostic("warning", "config-type", "config." + section + "." + key + " must be an integer; using default"))
    return fallback
  }
  if (value < minimum || value > maximum) {
    diagnostics.push(diagnostic("warning", "config-range", "config." + section + "." + key + " must be between " + minimum + " and " + maximum + "; using default"))
    return fallback
  }
  return value
}

function readStringList(object, section, key, diagnostics) {
  if (!Object.prototype.hasOwnProperty.call(object, key)) return []
  var value = object[key]
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic("warning", "config-type", "config." + section + "." + key + " must be an array; using default"))
    return []
  }
  var output = []
  for (var index = 0; index < value.length; index++) {
    if (output.length >= maxListItems) {
      diagnostics.push(diagnostic("warning", "config-limit", "config." + section + "." + key + " keeps at most " + maxListItems + " items"))
      break
    }
    if (typeof value[index] !== "string") {
      diagnostics.push(diagnostic("warning", "config-type", "config." + section + "." + key + "[" + index + "] must be a string"))
      continue
    }
    var item = value[index].trim()
    if (!item) continue
    if (item.length > maxPathLength) {
      diagnostics.push(diagnostic("warning", "config-too-long", "config." + section + "." + key + "[" + index + "] exceeds " + maxPathLength + " characters"))
      continue
    }
    output.push(item)
  }
  return output
}

function readSources(object, section, key, diagnostics) {
  if (!Object.prototype.hasOwnProperty.call(object, key)) return []
  var value = object[key]
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic("warning", "config-type", "config." + section + "." + key + " must be an array; using default"))
    return []
  }
  var output = []
  var seen = Object.create(null)
  for (var index = 0; index < value.length; index++) {
    if (output.length >= maxListItems) {
      diagnostics.push(diagnostic("warning", "config-limit", "config." + section + "." + key + " keeps at most " + maxListItems + " items"))
      break
    }
    var item = value[index]
    if (!isObject(item)) {
      diagnostics.push(diagnostic("warning", "config-type", "config." + section + "." + key + "[" + index + "] must be an object with name and path"))
      continue
    }
    var name = typeof item.name === "string" ? item.name.trim() : ""
    var path = typeof item.path === "string" ? item.path.trim() : ""
    if (!name || !path) {
      diagnostics.push(diagnostic("warning", "config-source", "config." + section + "." + key + "[" + index + "] requires non-empty name and path"))
      continue
    }
    if (name.length > 64 || path.length > maxPathLength) {
      diagnostics.push(diagnostic("warning", "config-too-long", "config." + section + "." + key + "[" + index + "] name or path is too long"))
      continue
    }
    if (seen[name]) {
      diagnostics.push(diagnostic("warning", "config-source", "config." + section + "." + key + " repeats source name " + name))
      continue
    }
    seen[name] = true
    output.push({ name: name, path: path })
  }
  return output
}

function warnUnknownKeys(object, section, allowed, diagnostics) {
  if (!isObject(object)) return
  var keys = Object.keys(object)
  for (var index = 0; index < keys.length; index++) {
    if (allowed.indexOf(keys[index]) < 0) diagnostics.push(diagnostic("warning", "config-key", "config." + section + "." + keys[index] + " is not a recognized setting"))
  }
}

function readSection(object, key, diagnostics) {
  if (!Object.prototype.hasOwnProperty.call(object, key)) return {}
  if (isObject(object[key])) return object[key]
  diagnostics.push(diagnostic("warning", "config-type", "config." + key + " must be an object; using default"))
  return {}
}

function parse(raw) {
  var diagnostics = []
  var config = empty()
  var text = String(raw || "")
  if (!text.trim()) return { config: config, diagnostics: diagnostics, present: false }
  if (text.length > maxConfigLength) {
    diagnostics.push(diagnostic("error", "config-too-large", "Configuration exceeds " + maxConfigLength + " characters"))
    return { config: config, diagnostics: diagnostics, present: true }
  }
  var value
  try { value = JSON.parse(text) } catch (_) {
    diagnostics.push(diagnostic("error", "config-invalid-json", "Configuration is not valid JSON"))
    return { config: config, diagnostics: diagnostics, present: true }
  }
  if (!isObject(value)) {
    diagnostics.push(diagnostic("error", "config-invalid", "Configuration must be a JSON object"))
    return { config: config, diagnostics: diagnostics, present: true }
  }
  warnUnknownKeys(value, "root", ["version", "compose", "includes", "search", "ui", "insert", "security"], diagnostics)
  if (Object.prototype.hasOwnProperty.call(value, "version") && value.version !== schemaVersion) {
    diagnostics.push(diagnostic("error", "config-version", "Unsupported configuration version " + JSON.stringify(value.version) + "; using defaults"))
    return { config: config, diagnostics: diagnostics, present: true }
  }

  var compose = readSection(value, "compose", diagnostics)
  warnUnknownKeys(compose, "compose", ["path", "sources"], diagnostics)
  config.compose.path = readString(compose, "compose", "path", "", diagnostics)
  config.compose.sources = readSources(compose, "compose", "sources", diagnostics)

  var includes = readSection(value, "includes", diagnostics)
  warnUnknownKeys(includes, "includes", ["enabled", "roots"], diagnostics)
  config.includes.enabled = readBool(includes, "includes", "enabled", config.includes.enabled, diagnostics)
  config.includes.roots = readStringList(includes, "includes", "roots", diagnostics)

  var search = readSection(value, "search", diagnostics)
  warnUnknownKeys(search, "search", ["fuzzy", "maxResults"], diagnostics)
  config.search.fuzzy = readBool(search, "search", "fuzzy", config.search.fuzzy, diagnostics)
  config.search.maxResults = readInt(search, "search", "maxResults", config.search.maxResults, 1, maxResultsLimit, diagnostics)

  var ui = readSection(value, "ui", diagnostics)
  warnUnknownKeys(ui, "ui", ["showTags", "showSource", "maskSensitive"], diagnostics)
  config.ui.showTags = readBool(ui, "ui", "showTags", config.ui.showTags, diagnostics)
  config.ui.showSource = readBool(ui, "ui", "showSource", config.ui.showSource, diagnostics)
  config.ui.maskSensitive = readBool(ui, "ui", "maskSensitive", config.ui.maskSensitive, diagnostics)

  var insert = readSection(value, "insert", diagnostics)
  warnUnknownKeys(insert, "insert", ["clearClipboardAfterPaste"], diagnostics)
  config.insert.clearClipboardAfterPaste = readBool(insert, "insert", "clearClipboardAfterPaste", config.insert.clearClipboardAfterPaste, diagnostics)

  var security = readSection(value, "security", diagnostics)
  warnUnknownKeys(security, "security", ["allowExternalPaths", "allowedRoots"], diagnostics)
  config.security.allowExternalPaths = readBool(security, "security", "allowExternalPaths", config.security.allowExternalPaths, diagnostics)
  config.security.allowedRoots = readStringList(security, "security", "allowedRoots", diagnostics)

  return { config: config, diagnostics: diagnostics, present: true }
}

function pathAllowed(candidate, roots) {
  if (!Array.isArray(roots) || !roots.length) return true
  var target = String(candidate || "")
  if (!target) return false
  for (var index = 0; index < roots.length; index++) {
    var root = String(roots[index] || "")
    if (root !== "/") root = root.replace(/\/+$/, "")
    if (!root) continue
    if (root === "/" ? target.charAt(0) === "/" : target === root || target.indexOf(root + "/") === 0) return true
  }
  return false
}

function resolvePath(value, home) {
  var path = String(value || "").trim()
  if (!path) return ""
  if (path.indexOf("~/") === 0) return home + path.substring(1)
  if (path === "~") return home
  if (path.charAt(0) === "/") return path
  return home + "/" + path
}

function selectSource(config, payload, env) {
  var home = String(env && env.HOME || "")
  var input = isObject(payload) ? payload : {}
  var payloadPath = typeof input.path === "string" ? input.path.trim() : ""
  if (payloadPath) return { path: resolvePath(payloadPath, home), name: "payload", origin: "payload", found: true }

  var sourceName = typeof input.source === "string" ? input.source.trim() : ""
  if (sourceName) {
    var sources = config && config.compose && Array.isArray(config.compose.sources) ? config.compose.sources : []
    for (var index = 0; index < sources.length; index++) {
      if (sources[index].name === sourceName) return { path: resolvePath(sources[index].path, home), name: sourceName, origin: "source", found: true }
    }
    return { path: "", name: sourceName, origin: "source", found: false }
  }

  var configured = config && config.compose && typeof config.compose.path === "string" ? config.compose.path : ""
  if (configured) return { path: resolvePath(configured, home), name: "config", origin: "config", found: true }

  var envPath = String(env && env.XCOMPOSEFILE || "").trim()
  if (envPath) return { path: resolvePath(envPath, home), name: "environment", origin: "env", found: true }

  return { path: home + "/.XCompose", name: "default", origin: "default", found: true }
}
