const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const readSafe = require("../scripts/read-safe.js")

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

  const policyRoot = path.join(root, "policy")
  const policyOutside = path.join(root, "policy-outside")
  fs.mkdirSync(policyRoot)
  fs.writeFileSync(policyOutside, "outside")
  const policyOpenSync = fs.openSync
  let policyOpenCount = 0
  fs.openSync = function(target, flags, mode) {
    policyOpenCount += 1
    return policyOpenSync.call(fs, target, flags, mode)
  }
  try {
    assert.throws(() => readSafe.readBoundedFile(policyOutside, 7, { roots: [policyRoot] }), error => error && error.exitCode === 6)
    assert.equal(policyOpenCount, 0)
  } finally {
    fs.openSync = policyOpenSync
  }

  let readCount = 0
  const readSync = fs.readSync
  fs.readSync = function(...args) { readCount += 1; return readSync.apply(fs, args) }
  try {
    assert.equal(readSafe.withBoundedFile(regular, 7, null, file => file.path), fs.realpathSync(regular))
    assert.equal(readCount, 0)
    assert.equal(readSafe.withBoundedFile(regular, 6, null, file => file.path), fs.realpathSync(regular))
    assert.equal(readCount, 0)
  } finally {
    fs.readSync = readSync
  }

  const allowed = path.join(root, "allowed")
  const moved = path.join(root, "allowed-moved")
  const outside = path.join(root, "outside")
  fs.mkdirSync(allowed)
  fs.mkdirSync(outside)
  const raced = path.join(allowed, "value")
  fs.writeFileSync(raced, "inside")
  fs.writeFileSync(path.join(outside, "value"), "outside")
  const candidate = fs.realpathSync(raced)
  const openSync = fs.openSync
  let swapped = false
  fs.openSync = function(target, flags, mode) {
    if (!swapped && target === candidate) {
      swapped = true
      fs.renameSync(allowed, moved)
      fs.symlinkSync(outside, allowed, "dir")
    }
    return openSync.call(fs, target, flags, mode)
  }
  try {
    assert.throws(
      () => readSafe.readBoundedFile(raced, 7, { roots: [allowed] }),
      error => error && error.exitCode === 6 && /outside the allowed roots/.test(error.message)
    )
  } finally {
    fs.openSync = openSync
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log("bounded reader tests passed")
