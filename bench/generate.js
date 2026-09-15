#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")

const directory = path.join(__dirname, "fixtures")
const letters = "abcdefghijklmnopqrstuvwxyz".split("")
const stress = process.argv.includes("--stress")

fs.mkdirSync(directory, { recursive: true })

function keysFor(index) {
  return [letters[Math.floor(index / 676) % 26], letters[Math.floor(index / 26) % 26], letters[index % 26]]
}

function entry(index, value) {
  const keys = keysFor(index)
  return `# Item ${index} @tags: bench, tag${index % 5}\n<Multi_key> <${keys[0]}> <${keys[1]}> <${keys[2]}> : "${value || "item-" + index}"`
}

function write(name, text) {
  fs.writeFileSync(path.join(directory, name), text.endsWith("\n") ? text : text + "\n")
}

function sized(count) {
  const lines = []
  for (let index = 0; index < count; index++) lines.push(entry(index))
  return lines.join("\n")
}

write("compose-100", sized(100))
write("compose-1000", sized(1000))
write("compose-unicode", [
  "# Arrow right @alias: seta",
  '<Multi_key> <r> <r> : "\\u2192" U2192',
  "# Accented",
  '<Multi_key> <a> <c> : "Caf\\u00e9"',
  "# Emoji",
  '<Multi_key> <e> <m> : "\\U0001F600"',
  "# Octal",
  '<Multi_key> <o> <c> : "\\141\\x72"',
  "# Multiline",
  '<Multi_key> <m> <l> : "first\\nsecond\\tthird"',
  "# Literal symbol",
  '<Multi_key> <a> <r> : "→"'
].join("\n"))
write("compose-comments", [
  "# Arrow right",
  "# Navigation keys",
  "<Multi_key> <r> <r> : \"→\"",
  "<Multi_key> <minus> <greater> : \"→\"",
  "",
  "<Multi_key> <c> <o> : \"©\" # Copyright @alias: copyright, copyleft",
  "",
  "# @name: Euro sign @tags: currency, money @alias: euro",
  "<Multi_key> <space> <e> : \"€\"",
  "",
  "# Secret @sensitive",
  "<Multi_key> <p> <w> : \"hunter2\"",
  "",
  "# @unknown: value",
  "<Multi_key> <u> <n> : \"u\""
].join("\n"))
write("compose-duplicates", [
  "# First",
  "<Multi_key> <r> <r> : \"→\"",
  "# Duplicate",
  "<Multi_key> <r> <r> : \"→\"",
  "# Conflict",
  "<Multi_key> <r> <r> : \"different\"",
  "# Another conflict",
  "<Multi_key> <l> <l> : \"a\"",
  "<Multi_key> <l> <l> : \"b\""
].join("\n"))
write("compose-invalid", [
  "this line has no separator",
  ": \"missing keysyms\"",
  "<Multi_key> <r> : not quoted",
  "<Multi_key> <t> : \"trailing\\",
  "include nope",
  "<Multi_key> <v> : \"valid\""
].join("\n"))
write("include-part-a", [
  "# From include A",
  "<Multi_key> <i> <a> : \"a\""
].join("\n"))
write("include-part-b", [
  "# From include B",
  "<Multi_key> <i> <b> : \"b\""
].join("\n"))
write("compose-includes", [
  'include "include-part-a"',
  'include "%L"',
  "# From root",
  "<Multi_key> <i> <r> : \"r\"",
  'include "include-part-b"'
].join("\n"))

if (stress) write("compose-10000", sized(10000))

console.log(`fixtures written to ${path.relative(process.cwd(), directory)}${stress ? " (with stress file)" : ""}`)
