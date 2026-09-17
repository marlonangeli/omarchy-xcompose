import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
// Parser, search, and history are imported as QML JavaScript namespaces.
import "XComposeParser.js" as XComposeParser
import "XComposeSearch.js" as XComposeSearch
import "XComposeHistory.js" as XComposeHistory
import "XComposeFavorites.js" as XComposeFavorites
import "XComposeConfig.js" as XComposeConfig
import "XComposeViewModel.js" as XComposeViewModel

Item {
  id: root

  property string home: Quickshell.env("HOME")
  property string xdgStateHome: Quickshell.env("XDG_STATE_HOME") || home + "/.local/state"
  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null
  readonly property string pluginId: manifest && manifest.id ? manifest.id : "dev.ilegna.xcompose"
  readonly property string pluginDir: manifest && manifest.__sourceDir ? manifest.__sourceDir : home + "/.config/omarchy/plugins/" + pluginId
  readonly property string stateDir: xdgStateHome + "/omarchy"
  readonly property string historyPath: stateDir + "/xcompose-history.json"
  readonly property string favoritesPath: stateDir + "/xcompose-favorites.json"
  readonly property string configHome: Quickshell.env("XDG_CONFIG_HOME") || home + "/.config"
  readonly property string configPath: Quickshell.env("XCOMPOSE_PICKER_CONFIG") || configHome + "/omarchy-xcompose/config.json"
  readonly property string runtimeDir: Quickshell.env("XDG_RUNTIME_DIR") || stateDir
  readonly property string secretDir: runtimeDir + "/xcompose"
  property string secretPath: ""
  property int secretSequence: 0
  property bool secretDirReady: false
  property string pendingSecret: ""
  property bool pendingCopy: false
  property bool secretWritePending: false
  property string activeSecretPath: ""
  readonly property int maxComposeBytes: XComposeParser.maxSourceBytes
  readonly property int maxStateBytes: XComposeHistory.maxStateBytes
  readonly property int maxConfigBytes: XComposeConfig.maxConfigLength

  property string composePath: ""
  property string composeLoadState: "loading"
  property string composeSourceName: ""
  property string composeSourceOrigin: ""
  property string sourceError: ""
  property string composeError: ""
  property var includeWatchPaths: []
  property bool includeWatchNeedsPolling: false
  property var config: XComposeConfig.empty()
  property var configDiagnostics: []
  property string configLoadState: "loading"
  property var pendingPayload: ({})
  property bool opened: false
  property string filterText: ""
  property int selectedIndex: 0
  property bool previewOpen: false
  property bool diagnosticsOpen: false
  property string revealedSensitiveId: ""
  property string actionError: ""
  property string previewDescription: ""
  property string previewSequence: ""
  property string previewResult: ""
  property string previewTags: ""
  property string previewSource: ""
  property int previewLine: 0
  property var entries: []
  property var diagnostics: []
  property var filteredGroups: []
  property var history: XComposeHistory.empty()
  property var favorites: XComposeFavorites.empty()
  property var variantSelections: ({})

  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color border: Color.menu.border
  property var borderSpec: Border.surfaceSpec("menu", "border", border, Math.max(1, Style.space(2)))
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property color selectedBorder: Color.menu.selectedBorder
  property var selectedBorderSpec: Border.surfaceSpec("menu", "selected-border", selectedBorder, 0)
  readonly property real rowReservedBorderLeft: Border.left(selectedBorderSpec)
  readonly property real rowReservedBorderRight: Border.right(selectedBorderSpec)
  readonly property int cornerRadius: Style.cornerRadius
  property string fontFamily: Style.font.menuFamily
  property int contentMargin: Style.spacing.panelPadding
  property int headerHeight: Math.max(Style.space(34), Style.font.title + Style.spacing.controlPaddingY * 2)
  property int contentSpacing: Style.spacing.md
  property int rowHeight: Math.max(Style.space(58), Style.font.heading + Style.font.caption + Style.spacing.rowPaddingX * 2)
  property int rowSpacing: Style.spacing.xs
  property int cardWidth: Math.min(Style.space(520), panel.width - Style.gapsOut * 2)
  property int cardHeight: Math.min(Style.space(540), panel.height - Style.gapsOut * 2)

  function environment() {
    return { HOME: home, XCOMPOSEFILE: Quickshell.env("XCOMPOSEFILE") }
  }

  function open(payloadJson) {
    var payload = ({})
    try { payload = JSON.parse(payloadJson || "{}") } catch (_) { payload = ({}) }
    if (!XComposeConfig.isObject(payload)) payload = ({})
    pendingPayload = payload
    filterText = ""
    selectedIndex = 0
    previewOpen = false
    diagnosticsOpen = false
    revealedSensitiveId = ""
    actionError = ""
    clearPreview()
    filteredGroups = []
    displayModel.clear()
    variantSelections = ({})
    opened = true
    composeLoadState = "loading"
    if (configLoadState === "ready" || configLoadState === "defaults") applyOpen()
    else if (configLoadState !== "loading") readConfig()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function applyOpen() {
    var selection = XComposeConfig.selectSource(config, pendingPayload, environment())
    composeSourceName = selection.name
    composeSourceOrigin = selection.origin
    if (!selection.found) {
      composePath = ""
      entries = []
      diagnostics = []
      includeWatchPaths = []
      includeWatchNeedsPolling = false
      sourceError = "Unknown compose source: " + selection.name
      composeLoadState = "invalid"
      rebuildDisplay()
      return
    }
    if (selection.origin === "payload" && !config.security.allowExternalPaths && !XComposeConfig.pathAllowed(selection.path, allowedRoots())) {
      composePath = selection.path
      entries = []
      diagnostics = []
      includeWatchPaths = []
      includeWatchNeedsPolling = false
      sourceError = "Path outside the allowed roots"
      composeLoadState = "invalid"
      rebuildDisplay()
      return
    }
    sourceError = ""
    composeError = ""
    includeWatchPaths = []
    includeWatchNeedsPolling = false
    composePath = selection.path
    composeLoadState = "loading"
    readCompose()
  }

  function close() { opened = false }

  function dismiss() {
    opened = false
    if (shell && typeof shell.hide === "function") shell.hide(pluginId)
  }

  function filterDisplayText() {
    // Keep filterText unchanged for matching; only make literal spaces visible.
    return filterText.replace(/ /g, "▁")
  }

  function loadCompose(raw) {
    var bundle = null
    try { bundle = JSON.parse(raw || "") } catch (_) { bundle = null }
    if (!bundle || typeof bundle !== "object" || !Array.isArray(bundle.files)) {
      entries = []
      diagnostics = [{ severity: "error", line: 0, code: "unreadable-source", message: "XCompose bundle is invalid" }]
      composeError = "XCompose bundle is invalid"
      includeWatchPaths = []
      includeWatchNeedsPolling = false
      composeLoadState = "invalid"
      rebuildDisplay()
      return
    }
    var parsed = XComposeParser.parseBundle(bundle)
    entries = parsed.entries
    var bundleDiagnostics = (bundle.diagnostics || []).map(function(item) {
      return { severity: item.severity, line: 0, code: item.code, message: item.message }
    })
    composeError = bundle.state === "ok" ? "" : String(bundle.message || "XCompose file is unreadable")
    if (bundle.state !== "ok" && bundle.message) {
      var code = bundle.state === "too-large" ? "source-too-large" : (bundle.state === "missing" ? "source-missing" : "unreadable-source")
      bundleDiagnostics.push({ severity: bundle.state === "missing" ? "warning" : "error", line: 0, code: code, message: bundle.message })
    }
    diagnostics = parsed.diagnostics.concat(bundleDiagnostics)
    includeWatchPaths = bundle.state === "ok" && Array.isArray(bundle.watchPaths) ? bundle.watchPaths.filter(function(filePath) {
      return typeof filePath === "string" && filePath.length > 0
    }) : []
    includeWatchNeedsPolling = bundle.state === "ok" && (bundle.watchLimitReached === true || bundleDiagnostics.some(function(item) { return item.code === "include-missing" }))
    composeLoadState = bundle.state === "ok" ? "ready" : (bundle.state || "invalid")
    rebuildDisplay()
  }

  function loadHistory(raw) {
    history = XComposeHistory.parse(raw)
    if (opened) rebuildDisplay()
  }

  function saveHistory() {
    historyFile.setText(JSON.stringify(history, null, 2) + "\n")
  }

  function loadFavorites(raw) {
    favorites = XComposeFavorites.parse(raw)
    if (opened) rebuildDisplay()
  }

  function includeRoots() {
    if (!config.includes.roots.length) return [home]
    return config.includes.roots.map(function(root) { return XComposeConfig.resolvePath(root, home) })
  }

  function allowedRoots() {
    var roots = [home]
    var xdgConfig = Quickshell.env("XDG_CONFIG_HOME")
    var xdgData = Quickshell.env("XDG_DATA_HOME")
    var temporary = Quickshell.env("TMPDIR") || "/tmp"
    if (xdgConfig) roots.push(xdgConfig)
    if (xdgData) roots.push(xdgData)
    if (temporary) roots.push(temporary)
    config.security.allowedRoots.forEach(function(root) { roots.push(XComposeConfig.resolvePath(root, home)) })
    return roots
  }

  function readOptions() {
    return {
      includes: { enabled: config.includes.enabled, roots: includeRoots() },
      security: {
        restrictRoot: composeSourceOrigin === "payload",
        allowExternalPaths: config.security.allowExternalPaths,
        allowedRoots: allowedRoots()
      }
    }
  }

  function readCompose() {
    composeRead.read(composePath, maxComposeBytes, [JSON.stringify(readOptions())])
  }

  function nextSecretPath() {
    secretSequence += 1
    return secretDir + "/pending-" + Quickshell.processId + "-" + Date.now() + "-" + secretSequence
  }

  function launchPendingFromFile() {
    var stagedPath = secretPath
    if (!pendingSecret || !stagedPath) return
    var script = pendingCopy ? "/scripts/copy.sh" : "/scripts/insert.sh"
    var command = ["bash", pluginDir + script, "--file", stagedPath]
    if (!pendingCopy) command.push("--clear", config.insert.clearClipboardAfterPaste ? "1" : "0")
    secretPath = ""
    pendingSecret = ""
    pendingCopy = false
    activeSecretPath = stagedPath
    secretAction.command = command
    secretAction.running = true
    dismiss()
  }

  function secretWriteFailed(error) {
    var stagedPath = secretPath
    secretPath = ""
    pendingSecret = ""
    pendingCopy = false
    secretWritePending = false
    actionError = "Could not stage the sensitive value"
    console.error("omarchy-xcompose: sensitive staging failed: " + error)
    if (stagedPath) Quickshell.execDetached(["rm", "-f", stagedPath])
  }
  function readFavorites() { favoritesRead.read(favoritesPath, maxStateBytes) }
  function readHistory() { historyRead.read(historyPath, maxStateBytes) }
  function readConfig() { configRead.read(configPath, maxConfigBytes) }

  function loadConfig(raw) {
    var parsed = XComposeConfig.parse(raw)
    config = parsed.config
    configDiagnostics = parsed.diagnostics
    configLoadState = parsed.present ? "ready" : "defaults"
    if (opened) applyOpen()
    else if (filteredGroups.length || entries.length) rebuildDisplay()
  }

  function configReadFailed(exitCode) {
    config = XComposeConfig.empty()
    if (exitCode === 3) configDiagnostics = []
    else if (exitCode === 5) configDiagnostics = [{ severity: "error", code: "config-too-large", message: "Configuration exceeds " + maxConfigBytes + " bytes" }]
    else configDiagnostics = [{ severity: "error", code: "config-unreadable", message: "Configuration must be a regular file within the size limit" }]
    configLoadState = exitCode === 3 ? "defaults" : "ready"
    if (opened) applyOpen()
    else if (filteredGroups.length || entries.length) rebuildDisplay()
  }

  function composeReadFailed(exitCode) {
    composeLoadState = exitCode === 3 ? "missing" : "invalid"
    composeError = exitCode === 3 ? "" : "XCompose path must be a regular file within the size limit"
    includeWatchPaths = []
    includeWatchNeedsPolling = false
    entries = []
    diagnostics = exitCode === 3 ? [] : [{ severity: "error", line: 0, code: "unreadable-source", message: "XCompose path must be a regular file within the size limit" }]
    rebuildDisplay()
  }

  function saveFavorites() {
    favoritesFile.setText(JSON.stringify(favorites, null, 2) + "\n")
  }

  function warningCount() { return diagnostics.filter(function(item) { return item.severity === "warning" }).length }
  function errorCount() { return diagnostics.filter(function(item) { return item.severity === "error" }).length }
  function conflictCount() { return diagnostics.filter(function(item) { return item.severity === "error" && item.code === "conflicting-sequence" }).length }
  function diagnosticErrorCount() { return errorCount() - conflictCount() }
  function configErrorCount() { return configDiagnostics.filter(function(item) { return item.severity === "error" }).length }
  function configWarningCount() { return configDiagnostics.filter(function(item) { return item.severity === "warning" }).length }
  function sourceName() { return composeSourceOrigin === "default" || !composeSourceName ? "default" : composeSourceName }

  function clearPreview() {
    previewDescription = ""
    previewSequence = ""
    previewResult = ""
    previewTags = ""
    previewSource = ""
    previewLine = 0
  }

  function viewOptions(variant, selected) {
    return {
      showTags: config.ui.showTags,
      maskSensitive: config.ui.maskSensitive,
      revealSensitive: selected === true && variant && variant.id === revealedSensitiveId
    }
  }

  function previewMetadataText() {
    var parts = []
    if (previewSequence) parts.push(previewSequence)
    if (previewLine) parts.push("line " + previewLine)
    if (previewSource) parts.push(previewSource)
    return parts.join("  •  ")
  }

  function previewResultText() {
    var variant = selectedVariant(selectedIndex)
    return XComposeViewModel.previewResultText(variant, previewResult, viewOptions(variant, true))
  }

  function selectedSensitive() {
    var variant = selectedVariant(selectedIndex)
    return variant ? variant.sensitive : false
  }

  function toggleReveal() {
    if (!config.ui.maskSensitive) return
    var variant = selectedVariant(selectedIndex)
    if (!variant || !variant.sensitive) return
    revealedSensitiveId = revealedSensitiveId === variant.id ? "" : variant.id
    rebuildDisplay()
    syncPreview()
  }

  function toggleDiagnostics() {
    diagnosticsOpen = !diagnosticsOpen
    if (diagnosticsOpen) previewOpen = false
  }

  function diagnosticsContent() {
    var lines = []
    diagnostics.forEach(function(item) { lines.push("line " + item.line + "  •  " + item.code + "  •  " + item.message) })
    configDiagnostics.forEach(function(item) { lines.push("config  •  " + item.code + "  •  " + item.message) })
    return lines.length ? lines.join("\n") : "No diagnostics"
  }

  function selectedVariant(index) {
    if (index < 0 || index >= displayModel.count || index >= filteredGroups.length) return null
    var group = filteredGroups[index]
    var row = displayModel.get(index)
    return group && row ? group.variants[row.variantIndex] : null
  }

  function syncPreview() {
    var variant = selectedVariant(selectedIndex)
    if (!variant) { clearPreview(); return }
    previewDescription = variant.descriptionPreview
    previewSequence = variant.sequencePreview
    previewResult = variant.result
    previewTags = XComposeViewModel.metadataText(variant)
    previewSource = config.ui.showSource ? XComposeViewModel.sourceLabel(variant.source) : ""
    previewLine = variant.line
  }

  function togglePreview() {
    if (!displayModel.count) return
    previewOpen = !previewOpen
    if (previewOpen) diagnosticsOpen = false
    syncPreview()
  }

  function footerText() {
    var parts = ["↑/↓ navigate", "Ctrl+F favorite", "Tab variants"]
    if (displayModel.count) parts.push((selectedIndex + 1) + "/" + displayModel.count)
    if (previewOpen) parts.push("Full preview")
    if (diagnosticsOpen) parts.push("Diagnostics")
    if (sourceError) parts.push(sourceError)
    if (actionError) parts.push(actionError)
    if (configErrorCount()) parts.push(configErrorCount() + " config error" + (configErrorCount() === 1 ? "" : "s"))
    else if (configWarningCount()) parts.push(configWarningCount() + " config warning" + (configWarningCount() === 1 ? "" : "s"))
    if (config.ui.maskSensitive && selectedSensitive()) parts.push(revealedSensitiveId ? "Ctrl+R hide" : "Ctrl+R reveal")
    if (conflictCount()) parts.push(conflictCount() + " conflict" + (conflictCount() === 1 ? "" : "s"))
    if (diagnosticErrorCount()) parts.push(diagnosticErrorCount() + " diagnostic error" + (diagnosticErrorCount() === 1 ? "" : "s"))
    if (warningCount()) parts.push(warningCount() + " rule warning" + (warningCount() === 1 ? "" : "s"))
    return parts.join("  •  ")
  }

  function footerActionsText() {
    if (diagnosticsOpen) return "Diagnostics  •  Ctrl+D results  •  Esc results"
    return previewOpen ? "Enter insert  •  Ctrl+C copy  •  Ctrl+P results  •  Esc results" : "Enter insert  •  Ctrl+C copy  •  Ctrl+P preview  •  Esc close"
  }

  function firstDiagnosticMessage(list) {
    for (var index = 0; index < list.length; index++) if (list[index].severity === "error") return list[index].message
    return list.length ? list[0].message : ""
  }

  function emptyTitle() {
    if (sourceError) return sourceError
    if (configErrorCount()) return "Configuration error"
    if (composeLoadState === "missing") return "XCompose file not found"
    if (composeLoadState === "too-large") return "XCompose file is too large"
    if (composeLoadState === "invalid") return "Could not load XCompose file"
    if (entries.length) return "No matching shortcuts"
    return "No valid XCompose entries"
  }

  function emptyDetail() {
    if (sourceError) return "Define it in " + configPath
    if (configErrorCount()) return firstDiagnosticMessage(configDiagnostics) + "  •  " + configPath
    if (composeLoadState === "missing") return "Create " + composePath + " or set XCOMPOSEFILE"
    if (composeError) return composeError + "  •  " + composePath
    return composePath
  }

  function rebuildDisplay(resetSelection) {
    var selectedGroupId = !resetSelection && filteredGroups.length && selectedIndex < filteredGroups.length ? filteredGroups[selectedIndex].groupId : ""
    var searchOptions = { fuzzy: config.search.fuzzy }
    var groups = XComposeSearch.search(entries, filterText, history, favorites, config.search.maxResults, searchOptions)
    filteredGroups = groups
    displayModel.clear()
    if (!groups.length) { selectedIndex = 0; previewOpen = false; revealedSensitiveId = ""; clearPreview(); return }
    var restored = -1
    for (var row = 0; row < groups.length; row++) if (groups[row].groupId === selectedGroupId) { restored = row; break }
    selectedIndex = resetSelection ? 0 : (restored >= 0 ? restored : Math.min(selectedIndex, groups.length - 1))
    var needle = XComposeSearch.normalize(filterText)
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i]
      var selected = XComposeViewModel.selectVariant(group, variantSelections)
      var match = selected.variantIndex === group.activeVariantIndex
        ? { descriptionRanges: group.descriptionRanges, resultRanges: group.resultRanges, sequenceRanges: group.sequenceRanges }
        : XComposeSearch.matchEntry(selected.variant, needle, searchOptions)
      displayModel.append(XComposeViewModel.buildRow(group, selected.variant, selected.variantIndex, match, viewOptions(selected.variant, i === selectedIndex)))
    }
    syncPreview()
    Qt.callLater(function() { results.positionViewAtIndex(selectedIndex, ListView.Contain) })
  }

  function setFilter(value) { filterText = value; selectedIndex = 0; previewOpen = false; revealedSensitiveId = ""; rebuildDisplay(true) }

  function select(delta) {
    if (!displayModel.count) return
    selectedIndex = (selectedIndex + delta + displayModel.count) % displayModel.count
    if (revealedSensitiveId) { revealedSensitiveId = ""; rebuildDisplay(); return }
    syncPreview()
    results.positionViewAtIndex(selectedIndex, ListView.Contain)
  }

  function selectAbsolute(index) {
    if (!displayModel.count) return
    selectedIndex = Math.max(0, Math.min(index, displayModel.count - 1))
    if (revealedSensitiveId) { revealedSensitiveId = ""; rebuildDisplay(); return }
    syncPreview()
    results.positionViewAtIndex(selectedIndex, ListView.Contain)
  }

  function cycleVariant(delta) {
    if (!displayModel.count) return
    var group = filteredGroups[selectedIndex]
    var current = displayModel.get(selectedIndex).variantIndex
    variantSelections[group.groupId] = (current + delta + group.variants.length) % group.variants.length
    revealedSensitiveId = ""
    rebuildDisplay()
  }

  function toggleFavorite(index) {
    if (index < 0 || index >= displayModel.count) return
    var variant = selectedVariant(index)
    if (!variant) return
    favorites = XComposeFavorites.toggle(favorites, variant.id, 100)
    saveFavorites()
    rebuildDisplay()
  }

  function activate(index) {
    useResult(index, false)
  }

  function copyResult(index) {
    useResult(index, true)
  }

  function useResult(index, copyOnly) {
    if (secretWritePending) return
    if (index < 0 || index >= displayModel.count) return
    var variant = selectedVariant(index)
    if (!variant || !variant.result) return
    actionError = ""
    if (variant.sensitive && !secretDirReady) {
      actionError = "Sensitive staging is unavailable"
      return
    }
    history = XComposeHistory.record(history, variant.id, Date.now(), 100)
    saveHistory()
    if (variant.sensitive) {
      secretPath = nextSecretPath()
      pendingSecret = variant.result
      pendingCopy = copyOnly
      secretWritePending = true
      Qt.callLater(function() { if (secretWritePending) secretFile.setText(pendingSecret) })
      return
    }
    dismiss()
    Quickshell.execDetached(["bash", pluginDir + (copyOnly ? "/scripts/copy.sh" : "/scripts/insert.sh"), "--", variant.result])
  }

  ListModel { id: displayModel }

  FileView {
    id: composeFile
    blockLoading: true
    blockAllReads: true
    preload: false
    watchChanges: true
    path: root.composePath
    printErrors: false
    onFileChanged: root.readCompose()
  }

  Variants {
    model: root.includeWatchPaths
    delegate: FileView {
      required property string modelData
      blockLoading: true
      blockAllReads: true
      preload: false
      watchChanges: true
      path: modelData
      printErrors: false
      onFileChanged: root.readCompose()
    }
  }

  FileView {
    id: favoritesFile
    blockLoading: true
    blockAllReads: true
    preload: false
    watchChanges: true
    path: root.favoritesPath
    atomicWrites: true
    printErrors: false
    onFileChanged: root.readFavorites()
  }

  FileView {
    id: historyFile
    blockLoading: true
    blockAllReads: true
    preload: false
    watchChanges: true
    path: root.historyPath
    atomicWrites: true
    printErrors: false
    onFileChanged: root.readHistory()
  }

  FileView {
    id: configFile
    blockLoading: true
    blockAllReads: true
    preload: false
    watchChanges: true
    path: root.configPath
    printErrors: false
    onFileChanged: root.readConfig()
  }

  FileView {
    id: secretFile
    blockLoading: true
    blockAllReads: true
    preload: false
    printErrors: false
    path: root.secretPath
    atomicWrites: false
    onSaved: root.launchPendingFromFile()
    onSaveFailed: function(error) { root.secretWriteFailed(error) }
  }

  BoundedFileReader {
    id: composeRead
    scriptPath: root.pluginDir + "/scripts/read-compose.js"
    onLoaded: function(text) { root.loadCompose(text) }
    onFailed: function(exitCode) { root.composeReadFailed(exitCode) }
  }

  BoundedFileReader {
    id: favoritesRead
    scriptPath: root.pluginDir + "/scripts/read-bounded.js"
    onLoaded: function(text) { root.loadFavorites(text) }
    onFailed: function(exitCode) { root.loadFavorites("") }
  }

  BoundedFileReader {
    id: historyRead
    scriptPath: root.pluginDir + "/scripts/read-bounded.js"
    onLoaded: function(text) { root.loadHistory(text) }
    onFailed: function(exitCode) { root.loadHistory("") }
  }

  BoundedFileReader {
    id: configRead
    scriptPath: root.pluginDir + "/scripts/read-bounded.js"
    onLoaded: function(text) { root.loadConfig(text) }
    onFailed: function(exitCode) { root.configReadFailed(exitCode) }
  }

  Process {
    id: secretDirSetup
    running: true
    command: ["node", root.pluginDir + "/scripts/prepare-secret-dir.js", root.secretDir]
    onExited: function(exitCode) {
      root.secretDirReady = exitCode === 0
      if (exitCode !== 0) console.error("omarchy-xcompose: sensitive directory setup failed")
    }
  }

  Process {
    id: secretAction
    running: false
    onExited: function(exitCode) {
      var stagedPath = root.activeSecretPath
      root.activeSecretPath = ""
      root.secretWritePending = false
      if (exitCode !== 0) root.actionError = "Sensitive action failed"
      if (stagedPath) Quickshell.execDetached(["rm", "-f", stagedPath])
    }
  }

  Timer {
    interval: 1000
    repeat: true
    running: root.opened && root.composeLoadState === "missing"
    onTriggered: root.readCompose()
  }

  Timer {
    interval: 1000
    repeat: true
    running: root.opened && root.includeWatchNeedsPolling
    onTriggered: root.readCompose()
  }

  Component.onCompleted: {
    Quickshell.execDetached(["mkdir", "-p", stateDir])
    Qt.callLater(function() { root.readConfig(); root.readFavorites(); root.readHistory() })
  }

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "ilegna-xcompose"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle { anchors.fill: parent; color: root.scrim }
    MouseArea { anchors.fill: parent; onClicked: root.dismiss() }

    BorderSurface {
      id: card
      width: root.cardWidth
      height: root.cardHeight
      anchors.centerIn: parent
      radius: root.cornerRadius
      color: root.background
      borderSpec: root.borderSpec
      padding: root.contentMargin
      MouseArea { anchors.fill: parent; onClicked: {} }

      Item {
        id: keyCatcher
        anchors.fill: parent
        focus: true
        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) {
          if (event.key === Qt.Key_Escape) { if (root.diagnosticsOpen) root.diagnosticsOpen = false; else if (root.previewOpen) root.previewOpen = false; else if (root.filterText) root.setFilter(""); else root.dismiss() }
          else if (event.key === Qt.Key_F && (event.modifiers & Qt.ControlModifier)) root.toggleFavorite(root.selectedIndex)
          else if (event.key === Qt.Key_P && (event.modifiers & Qt.ControlModifier)) root.togglePreview()
          else if (event.key === Qt.Key_D && (event.modifiers & Qt.ControlModifier)) root.toggleDiagnostics()
          else if (event.key === Qt.Key_R && (event.modifiers & Qt.ControlModifier)) root.toggleReveal()
          else if (Util.editsFilter(event, root.filterText)) root.setFilter(Util.editedFilter(event, root.filterText))
          else if (event.key === Qt.Key_Up) root.select(-1)
          else if (event.key === Qt.Key_Down) root.select(1)
          else if (event.key === Qt.Key_Home) root.selectAbsolute(0)
          else if (event.key === Qt.Key_End) root.selectAbsolute(displayModel.count - 1)
          else if (event.key === Qt.Key_PageUp) root.select(-Math.max(1, Math.floor(results.height / root.rowHeight)))
          else if (event.key === Qt.Key_PageDown) root.select(Math.max(1, Math.floor(results.height / root.rowHeight)))
          else if (event.key === Qt.Key_Tab) root.cycleVariant(event.modifiers & Qt.ShiftModifier ? -1 : 1)
          else if (event.key === Qt.Key_C && (event.modifiers & Qt.ControlModifier)) root.copyResult(root.selectedIndex)
          else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) root.activate(root.selectedIndex)
          else if (event.text && event.text.length === 1 && event.text.charCodeAt(0) >= 32 && event.text.charCodeAt(0) !== 127) root.setFilter(root.filterText + event.text)
          else return
          event.accepted = true
        }
      }

      Column {
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
        spacing: root.contentSpacing

        Item {
          width: parent.width
          height: root.headerHeight

          Text {
            id: searchIcon
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            width: Style.space(28)
            text: "󰍉"
            color: root.foreground
            opacity: root.filterText ? 0.78 : 0.48
            font.family: root.fontFamily
            font.pixelSize: Style.font.icon
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
          }

          Text {
            id: sourceBadge
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            visible: root.composeSourceOrigin !== "default" && root.composeSourceOrigin !== ""
            text: root.sourceName()
            textFormat: Text.PlainText
            color: root.foreground
            opacity: 0.45
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }

          Text {
            anchors.left: searchIcon.right
            anchors.leftMargin: Style.spacing.sm
            anchors.right: sourceBadge.visible ? sourceBadge.left : parent.right
            anchors.rightMargin: Style.spacing.sm
            anchors.verticalCenter: parent.verticalCenter
            text: root.filterText ? root.filterDisplayText() : "Search XCompose shortcuts…"
            textFormat: Text.PlainText
            color: root.foreground
            opacity: root.filterText ? 1 : 0.58
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading
            elide: Text.ElideRight
          }
        }

        Item {
          width: parent.width
          height: parent.height - root.headerHeight - footer.implicitHeight - root.contentSpacing * 2

          ListView {
            id: results
            anchors.fill: parent
            visible: !root.previewOpen && !root.diagnosticsOpen
            model: displayModel
            spacing: root.rowSpacing
            clip: true
            reuseItems: true
            boundsBehavior: Flickable.StopAtBounds
            delegate: BorderSurface {
              required property int index
              required property string descriptionMarkup
              required property string preview
              required property string previewMarkup
              required property string sequenceMarkup
              required property int variants
              required property bool favorite
              readonly property bool hasCursor: index === root.selectedIndex
              width: results.width
              height: root.rowHeight
              radius: root.cornerRadius
              color: hasCursor ? root.selectedBackground : "transparent"
              borderSpec: hasCursor ? root.selectedBorderSpec : Border.none()
              clip: true
              Item {
                anchors.fill: parent
                anchors.leftMargin: root.rowReservedBorderLeft + Style.space(8)
                anchors.rightMargin: root.rowReservedBorderRight + Style.space(8)
                anchors.topMargin: Style.spacing.sm
                anchors.bottomMargin: Style.spacing.sm
                Item {
                  id: labelCell
                  anchors.left: favoriteCell.right; anchors.leftMargin: Style.spacing.sm; anchors.top: parent.top; anchors.bottom: parent.bottom; anchors.right: previewCell.left; anchors.rightMargin: Style.spacing.md
                  clip: true
                  Column {
                    width: parent.width
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.spacing.xs
                    Text { width: parent.width; text: descriptionMarkup; textFormat: Text.StyledText; color: hasCursor ? root.selectedText : root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.heading; font.weight: Font.Medium; elide: Text.ElideRight; maximumLineCount: 1; wrapMode: Text.NoWrap }
                    Text { width: parent.width; text: sequenceMarkup + (variants > 1 ? "  •  " + variants + " variants" : ""); textFormat: Text.StyledText; color: hasCursor ? root.selectedText : root.foreground; opacity: 0.58; font.family: root.fontFamily; font.pixelSize: Style.font.caption; elide: Text.ElideRight; maximumLineCount: 1; wrapMode: Text.NoWrap }
                  }
                }
                Item {
                  id: favoriteCell
                  width: favorite ? Math.max(Style.space(28), Style.font.title + Style.spacing.sm) : 0
                  anchors.left: parent.left; anchors.top: parent.top; anchors.bottom: parent.bottom
                  clip: true
                  Text {
                    anchors.fill: parent
                    visible: favorite
                    text: "󰓎"
                    textFormat: Text.PlainText
                    color: hasCursor ? root.selectedText : root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.icon
                    horizontalAlignment: Text.AlignLeft
                    verticalAlignment: Text.AlignVCenter
                  }
                }
                Item {
                  id: previewCell
                  width: Math.min(Style.space(160), parent.width * 0.34)
                  anchors.right: parent.right; anchors.top: parent.top; anchors.bottom: parent.bottom
                  clip: true
                  Text { anchors.fill: parent; text: previewMarkup; textFormat: Text.StyledText; color: hasCursor ? root.selectedText : root.foreground; font.family: root.fontFamily; font.pixelSize: preview.length <= 3 ? Style.font.iconLarge : Style.font.title; elide: Text.ElideRight; maximumLineCount: 1; wrapMode: Text.NoWrap; horizontalAlignment: Text.AlignRight; verticalAlignment: Text.AlignVCenter }
                }
              }
              MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.activate(index)
              }
            }
          }

          Column {
            id: previewPane
            anchors.fill: parent
            visible: root.previewOpen && displayModel.count > 0
            spacing: root.contentSpacing

            Text {
              id: previewTitle
              width: parent.width
              text: root.previewDescription
              textFormat: Text.PlainText
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              elide: Text.ElideRight
              maximumLineCount: 1
            }

            Text {
              id: previewMetadata
              width: parent.width
              text: root.previewMetadataText()
              textFormat: Text.PlainText
              color: root.foreground
              opacity: 0.58
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
              maximumLineCount: 1
            }

            Text {
              id: previewTagsLine
              width: parent.width
              visible: text.length > 0
              text: root.previewTags
              textFormat: Text.PlainText
              color: root.foreground
              opacity: 0.58
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
              maximumLineCount: 1
            }

            Rectangle {
              width: parent.width
              height: Math.max(0, parent.height - previewTitle.implicitHeight - previewMetadata.implicitHeight - (previewTagsLine.visible ? previewTagsLine.implicitHeight : 0) - previewPane.spacing * (previewTagsLine.visible ? 3 : 2))
              radius: root.cornerRadius
              color: root.selectedBackground
              border.width: 1
              border.color: root.border
              clip: true

              Flickable {
                id: previewScroll
                anchors.fill: parent
                anchors.margins: Style.spacing.md
                contentWidth: width
                contentHeight: Math.max(height, fullPreviewText.implicitHeight)
                clip: true
                boundsBehavior: Flickable.StopAtBounds

                Text {
                  id: fullPreviewText
                  width: previewScroll.width
                  text: root.previewResultText()
                  textFormat: Text.PlainText
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  wrapMode: Text.WrapAnywhere
                }
              }
            }
          }

          Column {
            id: diagnosticsPane
            anchors.fill: parent
            visible: root.diagnosticsOpen
            spacing: root.contentSpacing

            Text {
              id: diagnosticsTitle
              width: parent.width
              text: "Diagnostics"
              textFormat: Text.PlainText
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              elide: Text.ElideRight
              maximumLineCount: 1
            }

            Rectangle {
              width: parent.width
              height: Math.max(0, parent.height - diagnosticsTitle.implicitHeight - diagnosticsPane.spacing)
              radius: root.cornerRadius
              color: root.selectedBackground
              border.width: 1
              border.color: root.border
              clip: true

              Flickable {
                id: diagnosticsScroll
                anchors.fill: parent
                anchors.margins: Style.spacing.md
                contentWidth: width
                contentHeight: Math.max(height, diagnosticsBody.implicitHeight)
                clip: true
                boundsBehavior: Flickable.StopAtBounds

                Text {
                  id: diagnosticsBody
                  width: diagnosticsScroll.width
                  text: root.diagnosticsContent()
                  textFormat: Text.PlainText
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  wrapMode: Text.WrapAnywhere
                }
              }
            }
          }

          Column {
            anchors.centerIn: parent
            visible: !root.previewOpen && !root.diagnosticsOpen && displayModel.count === 0
            spacing: Style.space(8)
            Text { width: parent.width; horizontalAlignment: Text.AlignHCenter; text: root.emptyTitle(); textFormat: Text.PlainText; color: root.foreground; opacity: 0.75; font.family: root.fontFamily; font.pixelSize: Style.font.title }
            Text { width: Math.min(implicitWidth, card.width - root.contentMargin * 2); horizontalAlignment: Text.AlignHCenter; text: root.emptyDetail(); textFormat: Text.PlainText; color: root.foreground; opacity: 0.52; font.family: root.fontFamily; font.pixelSize: Style.font.caption; elide: Text.ElideMiddle }
          }
        }

        Column {
          id: footer
          width: parent.width
          spacing: Style.spacing.xs

          Text {
            id: footerActions
            width: parent.width
            text: root.footerActionsText()
            textFormat: Text.PlainText
            color: root.foreground
            opacity: 0.58
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }

          Text {
            id: footerStatus
            width: parent.width
            text: root.footerText()
            textFormat: Text.PlainText
            color: root.foreground
            opacity: 0.45
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }
        }
      }
    }
  }
}
