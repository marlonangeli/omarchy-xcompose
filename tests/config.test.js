const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

function load(name) {
  const context = { console }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", name), "utf8"), context)
  return context
}

const config = load("XComposeConfig.js")
const home = "/home/user"
const env = { HOME: home, XCOMPOSEFILE: "/etc/xcompose" }

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

const defaults = config.parse("")
assert.equal(defaults.present, false)
assert.deepEqual(Array.from(defaults.diagnostics), [])
assert.equal(defaults.config.schemaVersion, config.schemaVersion)
assert.equal(defaults.config.compose.path, "")
assert.equal(defaults.config.includes.enabled, false)
assert.equal(defaults.config.search.fuzzy, true)
assert.equal(defaults.config.search.maxResults, config.defaultResults)
assert.equal(defaults.config.ui.maskSensitive, true)
assert.equal(defaults.config.ui.showSourceBadge, false)
assert.equal(defaults.config.security.allowExternalPaths, false)

const full = config.parse(JSON.stringify({
  version: 1,
  compose: { path: "~/custom/.XCompose", sources: [{ name: "work", path: "~/work/.XCompose" }] },
  includes: { enabled: true, roots: ["~/work"] },
  search: { fuzzy: false, maxResults: 50 },
  ui: { showTags: false, showSource: false, showSourceBadge: true, maskSensitive: false },
  insert: { clearClipboardAfterPaste: false },
  security: { allowExternalPaths: true, allowedRoots: ["/srv/compose"] }
}))
assert.deepEqual(Array.from(full.diagnostics), [])
assert.equal(full.config.compose.path, "~/custom/.XCompose")
assert.equal(full.config.compose.sources[0].name, "work")
assert.equal(full.config.includes.roots[0], "~/work")
assert.equal(full.config.search.fuzzy, false)
assert.equal(full.config.search.maxResults, 50)
assert.equal(full.config.ui.maskSensitive, false)
assert.equal(full.config.ui.showSourceBadge, true)
assert.equal(full.config.insert.clearClipboardAfterPaste, false)
assert.equal(full.config.security.allowedRoots[0], "/srv/compose")

const partial = config.parse('{"search":{"maxResults":10}}')
assert.equal(partial.config.search.maxResults, 10)
assert.equal(partial.config.search.fuzzy, true)
assert.equal(partial.config.compose.path, "")

assert.equal(config.parse("{").diagnostics[0].code, "config-invalid-json")
assert.equal(config.parse("[]").diagnostics[0].code, "config-invalid")
assert.equal(config.parse('{"version":2}').diagnostics[0].code, "config-version")
assert.ok(config.parse('{"search":{"fuzzyy":true}}').diagnostics.some(item => item.code === "config-key"))
assert.ok(config.parse('{"search":{"maxResults":"a"}}').diagnostics.some(item => item.code === "config-type"))
assert.ok(config.parse('{"search":{"maxResults":0}}').diagnostics.some(item => item.code === "config-range"))
assert.ok(config.parse('{"search":{"maxResults":501}}').diagnostics.some(item => item.code === "config-range"))
assert.ok(config.parse('{"ui":{"showTags":"yes"}}').diagnostics.some(item => item.code === "config-type"))
assert.ok(config.parse('{"ui":{"showSourceBadge":"yes"}}').diagnostics.some(item => item.code === "config-type"))
assert.ok(config.parse('{"compose":{"sources":[{"name":"a"}]}}').diagnostics.some(item => item.code === "config-source"))
assert.ok(config.parse('{"compose":{"sources":[{"name":"a","path":"x"},{"name":"a","path":"y"}]}}').diagnostics.some(item => item.code === "config-source"))
assert.equal(config.parse("x".repeat(config.maxConfigLength + 1)).diagnostics[0].code, "config-too-large")

const malformedSections = config.parse('{"compose":true,"includes":[],"search":"bad","ui":1,"insert":false,"security":null}')
assert.equal(malformedSections.diagnostics.filter(item => item.code === "config-type").length, 6)
assert.deepEqual(plain(malformedSections.config), plain(config.empty()))

const manySources = { compose: { sources: Array.from({ length: config.maxListItems + 5 }, (_, index) => ({ name: `s${index}`, path: `p${index}` })) } }
assert.equal(config.parse(JSON.stringify(manySources)).config.compose.sources.length, config.maxListItems)

assert.equal(config.resolvePath("~/x", home), home + "/x")
assert.equal(config.resolvePath("~", home), home)
assert.equal(config.resolvePath("x", home), home + "/x")
assert.equal(config.resolvePath("/x", home), "/x")
assert.equal(config.resolvePath("", home), "")
assert.equal(config.pathAllowed("/", ["/"]), true)
assert.equal(config.pathAllowed("/etc/x", ["/"]), true)
assert.equal(config.pathAllowed("etc/x", ["/"]), false)
assert.equal(config.pathAllowed("/srv/x", ["/srv/"]), true)
assert.equal(config.pathAllowed("/srv2/x", ["/srv"]), false)

const configured = config.parse(JSON.stringify({
  version: 1,
  compose: { path: "~/custom/.XCompose", sources: [{ name: "work", path: "~/work/.XCompose" }] },
  security: { allowedRoots: ["/srv"] }
})).config

assert.deepEqual(plain(config.selectSource(configured, { path: "/tmp/payload.XCompose" }, env)), { path: "/tmp/payload.XCompose", name: "payload", origin: "payload", found: true })
assert.deepEqual(plain(config.selectSource(configured, { path: "relative.XCompose" }, env)), { path: home + "/relative.XCompose", name: "payload", origin: "payload", found: true })
assert.deepEqual(plain(config.selectSource(configured, { source: "work" }, env)), { path: home + "/work/.XCompose", name: "work", origin: "source", found: true })
assert.equal(config.selectSource(configured, { source: "nope" }, env).found, false)
assert.equal(config.selectSource(configured, {}, env).origin, "config")
assert.equal(config.selectSource(config.empty(), {}, env).path, "/etc/xcompose")
assert.equal(config.selectSource(config.empty(), {}, { HOME: home, XCOMPOSEFILE: "rel.XCompose" }).path, home + "/rel.XCompose")
assert.deepEqual(plain(config.selectSource(config.empty(), {}, { HOME: home })), { path: home + "/.XCompose", name: "default", origin: "default", found: true })
assert.deepEqual(config.selectSource(configured, "not-an-object", env).origin, "config")

console.log("config tests passed")
