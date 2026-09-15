var sensitiveMask = "󰌾 ••••••"

function escapeMarkup(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;")
}

function highlightMarkup(value, ranges) {
  var text = String(value || "")
  var spans = (ranges || []).filter(function(range) { return range && range.length > 0 && range.start < text.length }).sort(function(a, b) { return a.start - b.start })
  var output = ""
  var at = 0
  for (var index = 0; index < spans.length; index++) {
    var start = Math.max(at, spans[index].start)
    var end = Math.min(text.length, start + spans[index].length)
    if (end <= at) continue
    output += escapeMarkup(text.substring(at, start)) + "<b><u>" + escapeMarkup(text.substring(start, end)) + "</u></b>"
    at = end
  }
  return output + escapeMarkup(text.substring(at))
}

function sensitiveMasked(sensitive, options) {
  var settings = options || {}
  return !!sensitive && settings.maskSensitive === true && settings.revealSensitive !== true
}

function selectVariant(group, variantSelections) {
  var saved = group && variantSelections ? variantSelections[group.groupId] : undefined
  var variantIndex = typeof saved === "number" ? Math.max(0, Math.min(saved, group.variants.length - 1)) : group.activeVariantIndex
  return { variant: group.variants[variantIndex], variantIndex: variantIndex }
}

function metadataText(variant) {
  var parts = []
  if (variant.tags && variant.tags.length) parts.push(variant.tags.map(function(tag) { return "#" + tag }).join(" "))
  if (variant.aliases && variant.aliases.length) parts.push(variant.aliases.join("  •  "))
  return parts.join("  •  ")
}

function sourceLabel(source) {
  var parts = String(source || "").split("/")
  return parts.length ? parts[parts.length - 1] : ""
}

function rowSuffix(variant, variantIndex, group, options) {
  var settings = options || {}
  var tagsText = settings.showTags && variant.tags && variant.tags.length ? "  •  #" + variant.tags.join(" #") : ""
  var variantsText = group.variants.length > 1 ? "  •  " + (variantIndex + 1) + "/" + group.variants.length : ""
  return tagsText + variantsText
}

function previewResultText(variant, result, options) {
  return sensitiveMasked(variant && variant.sensitive, options) ? sensitiveMask : String(result || "")
}

function buildRow(group, variant, variantIndex, match, options) {
  var settings = options || {}
  var ranges = match || { descriptionRanges: [], resultRanges: [], sequenceRanges: [] }
  var masked = sensitiveMasked(variant.sensitive, settings)
  var previewText = masked ? sensitiveMask : variant.valuePreview
  return {
    groupId: group.groupId,
    description: variant.descriptionPreview,
    descriptionMarkup: highlightMarkup(variant.descriptionPreview, ranges.descriptionRanges),
    preview: previewText,
    previewMarkup: masked ? escapeMarkup(previewText) : highlightMarkup(variant.valuePreview, ranges.resultRanges),
    sequenceMarkup: highlightMarkup(variant.sequencePreview, ranges.sequenceRanges) + escapeMarkup(rowSuffix(variant, variantIndex, group, settings)),
    variants: group.variants.length,
    variantIndex: variantIndex,
    favorite: group.favorite,
    sensitive: variant.sensitive === true
  }
}

function emptyQueryMatch() {
  return { descriptionRanges: [], resultRanges: [], sequenceRanges: [] }
}
