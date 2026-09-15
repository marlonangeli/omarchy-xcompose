const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = fs.mkdtempSync(path.join(os.tmpdir(), "xcompose-bundle-"))
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "xcompose-outside-"))
const reader = path.join(__dirname, "..", "scripts", "read-compose.js")

function read(target, limit, enabled, roots, security) {
  const options = { includes: { enabled: enabled === true, roots: roots || [] }, security: security || {} }
  return childProcess.spawnSync(process.execPath, [reader, target, String(limit), JSON.stringify(options)], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
}

function bundleOf(target, limit, enabled, roots, security) {
  const run = read(target, limit, enabled, roots, security)
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

try {
  const main = path.join(root, "main")
  const extra = path.join(root, "extra")
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
  assert.deepEqual(Array.from(bundle.diagnostics), [])

  fs.symlinkSync(extra, path.join(root, "extra-link"))
  fs.writeFileSync(main, 'include "extra-link"\n')
  bundle = bundleOf(main, 1024, true, [root])
  assert.equal(bundle.files.length, 2)
  assert.equal(bundle.files[1].path, fs.realpathSync(extra))

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

  bundle = bundleOf(path.join(root, "missing"), 1024, false)
  assert.equal(bundle.state, "missing")
  assert.equal(bundle.files.length, 0)

  fs.writeFileSync(main, "x".repeat(64))
  bundle = bundleOf(main, 8, false)
  assert.equal(bundle.state, "too-large")
  assert.equal(bundle.files.length, 0)

  fs.mkdirSync(path.join(root, "many"))
  const includes = []
  for (let index = 0; index < 20; index++) {
    fs.writeFileSync(path.join(root, "many", `f${index}`), `<Multi_key> <F${index}> : "${index}"\n`)
    includes.push(`include "many/f${index}"`)
  }
  fs.writeFileSync(main, includes.join("\n") + "\n")
  bundle = bundleOf(main, 1024 * 1024, true, [root])
  assert.equal(bundle.files.length, 16)
  assert.ok(bundle.diagnostics.some(item => item.code === "include-limit"))

  fs.writeFileSync(main, '<Multi_key> <r> : "r"\n')
  bundle = bundleOf(main, 1024, false, [], { allowedRoots: [root] })
  assert.equal(bundle.state, "ok")
  bundle = bundleOf(main, 1024, false, [], { allowedRoots: [path.join(root, "elsewhere")] })
  assert.equal(bundle.state, "invalid")
  assert.match(bundle.message, /outside the allowed roots/)
  bundle = bundleOf(main, 1024, false, [], { allowExternalPaths: true, allowedRoots: [path.join(root, "elsewhere")] })
  assert.equal(bundle.state, "ok")
  bundle = bundleOf(main, 1024, false, [], { allowedRoots: [] })
  assert.equal(bundle.state, "ok")
} finally {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
}

console.log("read compose tests passed")
