const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const workflowPath = path.join(__dirname, "..", ".github", "workflows", "tag-release.yml")
const workflow = fs.readFileSync(workflowPath, "utf8")
const ciWorkflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8")

assert.match(ciWorkflow, /push:\s*\n\s*branches:\s*\n\s*- main/)
assert.match(ciWorkflow, /pull_request:\s*\n\s*branches:\s*\n\s*- main/)

assert.match(workflow, /workflow_run:/)
assert.match(workflow, /workflows:\s*\n\s*- CI/)
assert.match(workflow, /branches:\s*\n\s*- main/)
assert.match(workflow, /types:\s*\n\s*- completed/)
assert.match(workflow, /permissions:\s*\n\s*contents: write/)
assert.match(workflow, /concurrency:\s*\n\s*group: release-tag/)
assert.match(workflow, /if: github\.event\.workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.event == 'push'/)
assert.match(workflow, /uses: actions\/checkout@[0-9a-f]{40}/)
assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/)
assert.doesNotMatch(workflow, /pull_request_target|pull_request\.merged|merge_commit_sha/)
assert.match(workflow, /git diff --quiet "\$TARGET_SHA\^" "\$TARGET_SHA" -- manifest\.json/)
assert.match(workflow, /JSON\.parse\(fs\.readFileSync\("manifest\.json"/)
assert.match(workflow, /tag=v\$\{version\}/)
assert.match(workflow, /git tag -a "\$TAG"/)
assert.match(workflow, /git push origin "refs\/tags\/\$TAG"/)
assert.match(workflow, /existing_commit="\$\(remote_tag_commit\)"/)
assert.match(workflow, /existing_commit" != "\$TARGET_SHA" && "\$CHANGED" == "true"/)
assert.match(workflow, /remote_tag_commit\)" == "\$TARGET_SHA/)
assert.match(workflow, /echo "tag_exists=true" >>"\$GITHUB_OUTPUT"/)
assert.match(workflow, /echo "tag_exists=false" >>"\$GITHUB_OUTPUT"/)
assert.match(workflow, /if: steps\.tag\.outputs\.tag_exists == 'true'/)
assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/)
assert.match(workflow, /gh release view "\$TAG" --json isDraft --jq '\.isDraft' 2>\/dev\/null/)
assert.match(workflow, /gh release edit "\$TAG" --draft=false/)
assert.match(workflow, /gh release create "\$TAG" --title "\$TAG" --generate-notes/)
assert.ok(workflow.indexOf("Create version tag") < workflow.indexOf("Publish GitHub release"))

function extractRunBlock(name) {
  const lines = workflow.split("\n")
  const step = lines.findIndex(function(line) { return line.trim() === `- name: ${name}` })
  assert.notEqual(step, -1, `missing step: ${name}`)
  let run = -1
  for (let index = step + 1; index < lines.length; index++) {
    if (/^\s{6}- /.test(lines[index])) break
    if (lines[index].trim() === "run: |") { run = index; break }
  }
  assert.notEqual(run, -1, `missing run block: ${name}`)
  const block = []
  for (let index = run + 1; index < lines.length; index++) {
    const line = lines[index]
    if (line.trim() && !line.startsWith("          ")) break
    block.push(line.startsWith("          ") ? line.slice(10) : line)
  }
  return block.join("\n")
}

const releaseScript = extractRunBlock("Publish GitHub release")

function runRelease(markers) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xcompose-release-"))
  const bin = path.join(root, "bin")
  fs.mkdirSync(bin)
  for (const marker of markers || []) fs.writeFileSync(path.join(root, marker), "")
  fs.writeFileSync(path.join(bin, "gh"), `#!/usr/bin/env bash
set -euo pipefail
state="$GH_STUB_STATE"
printf '%s\\n' "$*" >>"$state/calls"
if [[ "$1" == "release" && "$2" == "view" ]]; then
  if [[ -f "$state/draft" ]]; then printf 'true\\n'; exit 0; fi
  if [[ -f "$state/existing" ]]; then printf 'false\\n'; exit 0; fi
  if [[ -f "$state/race" && -f "$state/create-attempted" ]]; then printf 'false\\n'; exit 0; fi
  printf 'release not found\\n' >&2
  exit 1
fi
if [[ "$1" == "release" && "$2" == "create" ]]; then
  : >"$state/create-attempted"
  if [[ -f "$state/create-fail" ]]; then printf 'create failed\\n' >&2; exit 1; fi
  exit 0
fi
if [[ "$1" == "release" && "$2" == "edit" ]]; then
  : >"$state/edited"
  exit 0
fi
exit 2
`)
  fs.chmodSync(path.join(bin, "gh"), 0o755)
  try {
    const result = childProcess.spawnSync("bash", ["-e", "-c", releaseScript], {
      encoding: "utf8",
      env: { ...process.env, PATH: bin + ":" + process.env.PATH, TAG: "v9.9.9", GH_STUB_STATE: root }
    })
    return {
      status: result.status,
      calls: fs.readFileSync(path.join(root, "calls"), "utf8"),
      edited: fs.existsSync(path.join(root, "edited"))
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

let release = runRelease([])
assert.equal(release.status, 0, release.calls)
assert.match(release.calls, /release create v9\.9\.9 --title v9\.9\.9 --generate-notes/)

release = runRelease(["existing"])
assert.equal(release.status, 0, release.calls)
assert.doesNotMatch(release.calls, /release create/)

release = runRelease(["draft"])
assert.equal(release.status, 0, release.calls)
assert.equal(release.edited, true)
assert.match(release.calls, /release edit v9\.9\.9 --draft=false/)

release = runRelease(["race", "create-fail"])
assert.equal(release.status, 0, release.calls)
assert.match(release.calls, /release create/)

release = runRelease(["create-fail"])
assert.notEqual(release.status, 0)

console.log("workflow tests passed")
