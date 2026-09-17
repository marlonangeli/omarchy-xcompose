const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = fs.mkdtempSync(path.join(os.tmpdir(), "xcompose-bundle-"))
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "xcompose-outside-"))
const reader = path.join(__dirname, "..", "scripts", "read-compose.js")
const validator = path.join(__dirname, "..", "scripts", "validate-compose.js")

function read(target, limit, enabled, roots, security, environment) {
  const options = { includes: { enabled: enabled === true, roots: roots || [] }, security: security || {} }
  return childProcess.spawnSync(process.execPath, [reader, target, String(limit), JSON.stringify(options)], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env: environment || process.env })
}

function bundleOf(target, limit, enabled, roots, security) {
  const run = read(target, limit, enabled, roots, security)
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

try {
  const main = path.join(root, "main")
  const extra = path.join(root, "extra")
  const configPath = path.join(root, "config.json")
  fs.writeFileSync(path.join(outside, "other"), '<Multi_key> <o> : "o"\n')
  fs.writeFileSync(extra, '<Multi_key> <e> : "e"\n')
  fs.writeFileSync(main, '# Root\n<Multi_key> <r> : "r"\ninclude "extra"\n')

  let bundle = bundleOf(main, 1024, false)
  assert.equal(bundle.state, "ok")
  assert.equal(bundle.files.length, 1)
  assert.equal(bundle.files[0].path, fs.realpathSync(main))
  assert.ok(bundle.diagnostics.some(item => item.code === "include-disabled"))

  bundle = bundleOf(main, 1024, true, [root])
  assert.equal(bundle.files.length, 2)
  assert.equal(bundle.files[1].path, fs.realpathSync(extra))
  assert.deepEqual(bundle.watchPaths, [extra])
  assert.deepEqual(Array.from(bundle.diagnostics), [])

  fs.symlinkSync(extra, path.join(root, "extra-link"))
  fs.writeFileSync(main, 'include "extra-link"\n')
  bundle = bundleOf(main, 1024, true, [root])
  assert.equal(bundle.files.length, 2)
  assert.equal(bundle.files[1].path, fs.realpathSync(extra))
  assert.deepEqual(bundle.watchPaths, [path.join(root, "extra-link")])

  fs.writeFileSync(extra, 'include "main"\n')
  fs.writeFileSync(main, 'include "extra"\n')
  bundle = bundleOf(main, 1024, true, [root])
  assert.equal(bundle.files.length, 2)
  assert.ok(bundle.diagnostics.some(item => item.code === "include-cycle"))

  fs.writeFileSync(main, `include "${path.join(outside, "other")}"\n`)
  bundle = bundleOf(main, 1024, true, [root])
  assert.equal(bundle.files.length, 1)
  assert.ok(bundle.diagnostics.some(item => item.code === "include-denied"))

  fs.writeFileSync(main, 'include "%L"\n')
  bundle = bundleOf(main, 1024, true, [root])
  assert.equal(bundle.files.length, 1)
  assert.ok(bundle.diagnostics.some(item => item.code === "include-system"))

  fs.writeFileSync(main, 'include nope\n')
  bundle = bundleOf(main, 1024, true, [root])
  assert.ok(bundle.diagnostics.some(item => item.code === "include-unparsed"))

  fs.writeFileSync(main, 'include "nope"\n')
  bundle = bundleOf(main, 1024, true, [root])
  assert.ok(bundle.diagnostics.some(item => item.code === "include-missing"))
  assert.deepEqual(bundle.watchPaths, [path.join(root, "nope")])

  fs.writeFileSync(main, 'include "missing-parent/nope"\n')
  bundle = bundleOf(main, 1024, true, [root])
  assert.ok(bundle.diagnostics.some(item => item.code === "include-missing"))
  assert.deepEqual(bundle.watchPaths, [])

  bundle = bundleOf(path.join(root, "missing"), 1024, false)
  assert.equal(bundle.state, "missing")
  assert.equal(bundle.files.length, 0)

  fs.writeFileSync(main, "x".repeat(64))
  bundle = bundleOf(main, 8, false)
  assert.equal(bundle.state, "too-large")
  assert.equal(bundle.files.length, 0)
  assert.match(bundle.message, /exceeds 8 bytes/)

  fs.mkdirSync(path.join(root, "many"))
  const includes = []
  for (let index = 0; index < 20; index++) {
    fs.writeFileSync(path.join(root, "many", `f${index}`), `<Multi_key> <F${index}> : "${index}"\n`)
    includes.push(`include "many/f${index}"`)
  }
  fs.rmSync(path.join(root, "many", "f15"))
  fs.mkdirSync(path.join(root, "many", "f15"))
  fs.writeFileSync(main, includes.join("\n") + "\n")
  bundle = bundleOf(main, 1024 * 1024, true, [root])
  assert.equal(bundle.files.length, 16)
  assert.equal(bundle.watchPaths.length, 15)
  assert.equal(bundle.watchLimitReached, true)
  assert.equal(bundle.diagnostics.filter(item => item.code === "include-watch-limit").length, 1)
  assert.ok(bundle.diagnostics.some(item => item.code === "include-limit"))
  assert.equal(bundle.diagnostics.filter(item => item.code === "include-limit").length, 1)
  assert.equal(bundle.diagnostics.some(item => item.code === "include-unreadable"), false)
  fs.writeFileSync(configPath, JSON.stringify({ version: 1, includes: { enabled: true, roots: [root] } }))
  let validation = childProcess.spawnSync(process.execPath, [validator, main, "--config", configPath], { encoding: "utf8" })
  assert.equal(validation.status, 1, validation.stdout + validation.stderr)
  assert.match(validation.stdout, /error: Stopped after 16 compose files/)
  assert.doesNotMatch(validation.stdout, /ok: no duplicate/)

  const late = path.join(root, "late")
  fs.writeFileSync(late, '<Multi_key> <l> : "late"\n')
  fs.writeFileSync(main, Array.from({ length: 15 }, (_, index) => `include "missing-${index}"`).concat('include "late"').join("\n") + "\n")
  bundle = bundleOf(main, 1024 * 1024, true, [root])
  assert.equal(bundle.files.length, 2)
  assert.equal(bundle.files[1].path, late)
  assert.equal(bundle.watchLimitReached, true)

  const boundary = path.join(root, "boundary")
  fs.mkdirSync(boundary)
  fs.writeFileSync(main, 'include "boundary/f0"\n')
  for (let index = 0; index < 15; index++) {
    const next = index === 14 ? main : `f${index + 1}`
    fs.writeFileSync(path.join(boundary, `f${index}`), `include "${next}"\n`)
  }
  bundle = bundleOf(main, 1024 * 1024, true, [root])
  assert.equal(bundle.files.length, 16)
  assert.ok(bundle.diagnostics.some(item => item.code === "include-cycle"))
  assert.equal(bundle.diagnostics.some(item => item.code === "include-limit"), false)

  fs.writeFileSync(main, `include "${path.join(outside, "other")}"\n`)
  bundle = bundleOf(main, 1024, true, ["/"])
  assert.equal(bundle.files.length, 2)
  assert.equal(bundle.diagnostics.some(item => item.code === "include-denied"), false)

  fs.writeFileSync(main, 'include "extra"\n')
  const defaultRootRun = read(main, 1024, true, [], {}, { ...process.env, HOME: root })
  assert.equal(defaultRootRun.status, 0, defaultRootRun.stderr)
  assert.equal(JSON.parse(defaultRootRun.stdout).files.length, 2)
  fs.writeFileSync(main, `include "${path.join(outside, "other")}"\n`)
  const deniedDefaultRun = read(main, 1024, true, [], {}, { ...process.env, HOME: root })
  assert.ok(JSON.parse(deniedDefaultRun.stdout).diagnostics.some(item => item.code === "include-denied"))

  fs.writeFileSync(main, '<Multi_key> <r> : "r"\n')
  bundle = bundleOf(main, 1024, false, [], { restrictRoot: true, allowedRoots: [root] })
  assert.equal(bundle.state, "ok")
  bundle = bundleOf(main, 1024, false, [], { restrictRoot: true, allowedRoots: [path.join(root, "elsewhere")] })
  assert.equal(bundle.state, "invalid")
  assert.match(bundle.message, /outside the allowed roots/)
  bundle = bundleOf(main, 1024, false, [], { restrictRoot: true, allowExternalPaths: true, allowedRoots: [path.join(root, "elsewhere")] })
  assert.equal(bundle.state, "ok")
  bundle = bundleOf(main, 1024, false, [], { restrictRoot: true, allowedRoots: ["/"] })
  assert.equal(bundle.state, "ok")
  bundle = bundleOf(main, 1024, false, [], { restrictRoot: true, allowedRoots: [] })
  assert.equal(bundle.state, "invalid")
  bundle = bundleOf(main, 1024, false, [], { restrictRoot: false, allowedRoots: [path.join(root, "elsewhere")] })
  assert.equal(bundle.state, "ok")

  fs.writeFileSync(extra, '<Multi_key> <r> : "included"\n')
  fs.writeFileSync(main, '<Multi_key> <r> : "root"\ninclude "extra"\n')
  fs.writeFileSync(configPath, JSON.stringify({ version: 1, includes: { enabled: true, roots: [root] } }))
  validation = childProcess.spawnSync(process.execPath, [validator, main, "--config", configPath], { encoding: "utf8" })
  assert.equal(validation.status, 1, validation.stdout + validation.stderr)
  assert.match(validation.stdout, /Compose sequence conflicts/)
  assert.doesNotMatch(validation.stdout, /include directive\(s\).*enable includes/)

  fs.writeFileSync(main, '<Multi_key> <r> : "root"\n')
  fs.writeFileSync(configPath, JSON.stringify({ version: 2 }))
  validation = childProcess.spawnSync(process.execPath, [validator, main, "--config", configPath], { encoding: "utf8" })
  assert.equal(validation.status, 1, validation.stdout + validation.stderr)
  assert.match(validation.stdout, /error: config: Unsupported configuration version/)
  assert.doesNotMatch(validation.stdout, /ok: no duplicate/)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
}

console.log("read compose tests passed")
