const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { loadTree, indexCompose } = require("../scripts/compose-tree")

const root = fs.mkdtempSync(path.join(os.tmpdir(), "xcompose-tree-"))
const treeCli = path.join(__dirname, "..", "scripts", "read-compose-tree.js")

function write(relative, contents) {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
  return target
}

try {
  const locale = write("locale/en_US.UTF-8/Compose", '<Multi_key> <a> <a> : "å"\n<Multi_key> <minus> <minus> <minus> : "—"\n<Multi_key> <space> <space> : " "\n')
  write("locale/compose.dir", "en_US.UTF-8/Compose\ten_US.UTF-8\n")
  const bundled = write("omarchy-default", 'include "%L"\n<Multi_key> <m> <s> : "😄" # smile\n<Multi_key> <space> <space> : "—"\n')
  const user = write("home/.XCompose", `include "${bundled}"\n<Multi_key> <space> <n> : "Spencer"\n`)
  const env = {
    HOME: path.join(root, "home"),
    XLOCALEDIR: path.join(root, "locale"),
    LANG: "en_US.UTF-8",
    LC_CTYPE: "en_US.UTF-8"
  }

  const tree = loadTree(user, { maxBytes: 1024 * 1024, env: env })
  assert.equal(tree.status, 0, tree.stderr)
  assert.deepEqual(tree.files.map(file => file.path), [locale, bundled, user])

  const indexed = indexCompose(user, { maxBytes: 1024 * 1024, env: env })
  assert.equal(indexed.status, 0, indexed.stderr)
  const results = Object.fromEntries(indexed.parsed.entries.map(entry => [entry.compactSequence, entry.result]))
  assert.equal(results.aa, "å")
  assert.equal(results.minusminusminus, "—")
  assert.equal(results.ms, "😄")
  assert.equal(results.spacen, "Spencer")
  assert.equal(results.spacespace, "—")
  assert.ok(indexed.parsed.diagnostics.some(item => item.code === "overridden-sequence"))

  const cli = childProcess.spawnSync(process.execPath, [treeCli, user, String(1024 * 1024)], { env: { ...process.env, ...env }, encoding: "utf8" })
  assert.equal(cli.status, 0, cli.stderr)
  const bundle = JSON.parse(cli.stdout)
  assert.equal(bundle.files.length, 3)

  const cycleFile = write("cycle.XCompose", 'include "cycle.XCompose"\n<Multi_key> <c> : "c"\n')
  const cycled = loadTree(cycleFile, { maxBytes: 1024, env: env })
  assert.equal(cycled.status, 0, cycled.stderr)
  assert.equal(cycled.files.length, 1)
  assert.ok(cycled.diagnostics.some(item => item.code === "include-cycle"))

  const missing = write("missing-include.XCompose", 'include "/no/such/compose/file"\n<Multi_key> <k> : "k"\n')
  const skipped = loadTree(missing, { maxBytes: 1024, env: env })
  assert.equal(skipped.status, 0, skipped.stderr)
  assert.equal(skipped.files.length, 1)
  assert.ok(skipped.diagnostics.some(item => item.code === "include-unreadable"))

  const missingRoot = loadTree(path.join(root, "absent.XCompose"), { maxBytes: 1024, env: env })
  assert.equal(missingRoot.status, 3)

  const omarchyDefault = "/usr/share/omarchy/default/xcompose"
  if (fs.existsSync(omarchyDefault) && fs.existsSync("/usr/share/X11/locale/en_US.UTF-8/Compose")) {
    const live = write("omarchy-user.XCompose", `include "${omarchyDefault}"\n<Multi_key> <space> <n> : "Spencer"\n`)
    const liveIndexed = indexCompose(live, {
      maxBytes: 1024 * 1024,
      env: { HOME: path.join(root, "home"), LANG: "en_US.UTF-8", LC_CTYPE: "en_US.UTF-8", XLOCALEDIR: "/usr/share/X11/locale" }
    })
    assert.equal(liveIndexed.status, 0, liveIndexed.stderr)
    assert.ok(liveIndexed.parsed.entries.some(entry => entry.compactSequence === "aa" && entry.result === "å"))
    assert.ok(liveIndexed.parsed.entries.some(entry => entry.compactSequence === "minusminusminus" && entry.result === "—"))
    assert.ok(liveIndexed.parsed.entries.some(entry => entry.compactSequence === "ms"))
    const spaceSpace = liveIndexed.parsed.entries.find(entry => entry.compactSequence === "spacespace")
    assert.equal(spaceSpace && spaceSpace.result, "—")
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log("compose tree tests passed")
