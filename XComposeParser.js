function decodeEscapes(value) {
  var output = ""

  for (var i = 0; i < value.length; i++) {
    var character = value[i]
    if (character !== "\\" || i + 1 >= value.length) {
      output += character
      continue
    }

    var escaped = value[++i]
    if (escaped === "n") output += "\n"
    else if (escaped === "t") output += "\t"
    else if (escaped === "r") output += "\r"
    else if (escaped === "\"") output += "\""
    else if (escaped === "\\") output += "\\"
    else if (escaped === "x") {
      var hexMatch = value.substring(i + 1).match(/^([0-9a-fA-F]{2,6})/)
      if (!hexMatch) {
        output += "x"
        continue
      }

      var codePoint = parseInt(hexMatch[1], 16)
      output += codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "\\x" + hexMatch[1]
      i += hexMatch[1].length
    } else if (/[0-7]/.test(escaped)) {
      var octalMatch = (escaped + value.substring(i + 1)).match(/^([0-7]{1,3})/)
      output += String.fromCodePoint(parseInt(octalMatch[1], 8))
      i += octalMatch[1].length - 1
    } else {
      output += escaped
    }
  }

  return output
}

function splitInlineComment(value) {
  var quoted = false
  var escaped = false

  for (var i = 0; i < value.length; i++) {
    var character = value[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (character === "\\") {
      escaped = true
      continue
    }

    if (character === "\"") {
      quoted = !quoted
      continue
    }

    if (character === "#" && !quoted) {
      return {
        value: value.substring(0, i).trim(),
        comment: value.substring(i + 1).trim()
      }
    }
  }

  return {
    value: value.trim(),
    comment: ""
  }
}

function extractResult(rhs) {
  var parts = splitInlineComment(rhs)
  var match = parts.value.match(/^"((?:\\.|[^"])*)"/)

  if (!match)
    return null

  return {
    value: decodeEscapes(match[1]),
    inlineComment: parts.comment
  }
}

function displayKey(key) {
  if (key === "Multi_key")
    return "Caps"

  var display = key.replace(/^KP_/, "").replace(/_/g, " ")
  return display.charAt(0).toUpperCase() + display.substring(1)
}

function extractSequence(lhs) {
  var sequence = []
  var regex = /<([^>]+)>/g
  var match

  while ((match = regex.exec(lhs)) !== null)
    sequence.push(displayKey(match[1]))

  return sequence
}

function normalize(value) {
  var text = String(value || "").toLowerCase()

  try {
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  } catch (_) {
  }

  return text
}

function fuzzyScore(haystack, needle) {
  haystack = normalize(haystack)
  needle = normalize(needle).trim()

  if (!needle)
    return 1

  var direct = haystack.indexOf(needle)
  if (direct >= 0)
    return 1000 - direct

  var haystackIndex = 0
  var needleIndex = 0
  var score = 0
  var streak = 0

  while (haystackIndex < haystack.length && needleIndex < needle.length) {
    if (haystack[haystackIndex] === needle[needleIndex]) {
      streak++
      score += 10 + streak * 3
      needleIndex++
    } else {
      streak = 0
    }

    haystackIndex++
  }

  return needleIndex === needle.length ? score : -1
}

function parse(raw) {
  var lines = String(raw || "").split(/\r?\n/)
  var entries = []
  var comments = []
  var currentDescription = ""

  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim()

    if (!trimmed) {
      comments = []
      currentDescription = ""
      continue
    }

    if (trimmed.startsWith("#")) {
      comments.push(trimmed.substring(1).trim())
      continue
    }

    if (/^include\s+/.test(trimmed)) {
      comments = []
      currentDescription = ""
      continue
    }

    var colon = trimmed.indexOf(":")
    if (colon < 0) {
      comments = []
      currentDescription = ""
      continue
    }

    if (comments.length > 0) {
      currentDescription = comments.join(" ")
      comments = []
    }

    var lhs = trimmed.substring(0, colon).trim()
    var parsedResult = extractResult(trimmed.substring(colon + 1))

    if (!parsedResult)
      continue

    var sequence = extractSequence(lhs)
    if (sequence.length === 0)
      continue

    var description = currentDescription || parsedResult.inlineComment || parsedResult.value

    entries.push({
      description: description,
      value: parsedResult.value,
      sequence: sequence,
      sequenceText: sequence.join(" · "),
      searchText: description + " " + parsedResult.value + " " + sequence.join(" ")
    })
  }

  return entries
}

function filter(entries, query, limit) {
  var output = []

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i]
    var score = fuzzyScore(entry.searchText, query)

    if (score >= 0)
      output.push({ entry: entry, score: score })
  }

  output.sort(function(a, b) {
    if (b.score !== a.score)
      return b.score - a.score

    return a.entry.description.localeCompare(b.entry.description)
  })

  return output.slice(0, limit || 100).map(function(item) {
    return item.entry
  })
}
