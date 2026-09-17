const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = fs.mkdtempSync(path.join(os.tmpdir(), "xcompose-secret-dir-"))
const script = path.join(__dirname, "..", "scripts", "prepare-secret-dir.js")

function prepare(target) {
  return childProcess.spawnSync(process.execPath, [script, target], { encoding: "utf8" })
}

try {
  const target = path.join(root, "runtime", "xcompose")
  let run = prepare(target)
  assert.equal(run.status, 0, run.stderr)
  assert.equal(fs.statSync(target).mode & 0o777, 0o700)

  fs.chmodSync(target, 0o755)
  fs.writeFileSync(path.join(target, "pending"), "legacy")
  fs.writeFileSync(path.join(target, "pending-99999999-1-1"), "stale")
  fs.writeFileSync(path.join(target, `pending-${process.pid}-1-1`), "active")
  fs.writeFileSync(path.join(target, "unrelated"), "keep")
  run = prepare(target)
  assert.equal(run.status, 0, run.stderr)
  assert.equal(fs.statSync(target).mode & 0o777, 0o700)
  assert.equal(fs.existsSync(path.join(target, "pending")), false)
  assert.equal(fs.existsSync(path.join(target, "pending-99999999-1-1")), false)
  assert.equal(fs.existsSync(path.join(target, `pending-${process.pid}-1-1`)), true)
  assert.equal(fs.existsSync(path.join(target, "unrelated")), true)

  const actual = path.join(root, "actual")
  const link = path.join(root, "link")
  fs.mkdirSync(actual, { mode: 0o755 })
  fs.symlinkSync(actual, link, "dir")
  run = prepare(link)
  assert.notEqual(run.status, 0)
  assert.equal(fs.statSync(actual).mode & 0o777, 0o755)

  const actualParent = path.join(root, "actual-parent")
  const linkParent = path.join(root, "link-parent")
  fs.mkdirSync(path.join(actualParent, "xcompose"), { recursive: true, mode: 0o755 })
  fs.symlinkSync(actualParent, linkParent, "dir")
  run = prepare(path.join(linkParent, "xcompose"))
  assert.notEqual(run.status, 0)
  assert.equal(fs.statSync(path.join(actualParent, "xcompose")).mode & 0o777, 0o755)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log("secret directory tests passed")
