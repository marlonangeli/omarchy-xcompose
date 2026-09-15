const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = fs.mkdtempSync(path.join(os.tmpdir(), "xcompose-reader-"))
const reader = path.join(__dirname, "..", "scripts", "read-bounded.js")

function read(target, limit) {
  return childProcess.spawnSync(process.execPath, [reader, target, String(limit)], { encoding: "utf8" })
}

try {
  const regular = path.join(root, "regular")
  fs.writeFileSync(regular, "compose")
  const regularRead = read(regular, 7)
  assert.equal(regularRead.status, 0, regularRead.stderr)
  assert.equal(regularRead.stdout, "compose")
  assert.equal(read(regular, 6).status, 5)

  const link = path.join(root, "link")
  fs.symlinkSync(regular, link)
  const linkRead = read(link, 7)
  assert.equal(linkRead.status, 0, linkRead.stderr)
  assert.equal(linkRead.stdout, "compose")

  const fifo = path.join(root, "fifo")
  childProcess.execFileSync("mkfifo", [fifo])
  assert.equal(read(fifo, 7).status, 4)

  const fifoLink = path.join(root, "fifo-link")
  fs.symlinkSync(fifo, fifoLink)
  assert.equal(read(fifoLink, 7).status, 4)

  const loopA = path.join(root, "loop-a")
  const loopB = path.join(root, "loop-b")
  fs.symlinkSync(loopB, loopA)
  fs.symlinkSync(loopA, loopB)
  assert.equal(read(loopA, 7).status, 4)

  assert.equal(read(path.join(root, "missing"), 7).status, 3)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log("bounded reader tests passed")
