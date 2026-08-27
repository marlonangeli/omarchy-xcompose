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

  property string composePath: ""
  property string composeLoadState: "loading"
  property bool opened: false
  property string filterText: ""
  property int selectedIndex: 0
  property bool previewOpen: false
  property string previewDescription: ""
  property string previewSequence: ""
  property string previewResult: ""
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

  function resolvePath(value) {
    var path = String(value || "").trim()
    if (!path) path = Quickshell.env("XCOMPOSEFILE") || home + "/.XCompose"
    if (path.indexOf("~/") === 0) return home + path.substring(1)
    if (path.charAt(0) === "/") return path
    return home + "/" + path
  }

  function open(payloadJson) {
    var payload = ({})
    try { payload = JSON.parse(payloadJson || "{}") } catch (_) { payload = ({}) }
    composePath = resolvePath(typeof payload.path === "string" ? payload.path : "")
    filterText = ""
    selectedIndex = 0
    previewOpen = false
    clearPreview()
    filteredGroups = []
    displayModel.clear()
    variantSelections = ({})
    opened = true
    composeLoadState = "loading"
    composeFile.reload()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function close() { opened = false }

  function dismiss() {
    opened = false
    if (shell && typeof shell.hide === "function") shell.hide(pluginId)
  }

  function escapeMarkup(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;")
  }

  function highlightMarkup(value, ranges) {
    var selected = {}
    ;(ranges || []).forEach(function(range) { for (var i = range.start; i < range.start + range.length; i++) selected[i] = true })
    var text = String(value || "")
    var output = ""
    for (var index = 0; index < text.length; index++) {
      var character = escapeMarkup(text.charAt(index))
      output += selected[index] ? "<b><u>" + character + "</u></b>" : character
    }
    return output
  }

  function filterDisplayText() {
    // Keep filterText unchanged for matching; only make literal spaces visible.
    return filterText.replace(/ /g, "▁")
  }

  function loadCompose(raw) {
    var parsed = XComposeParser.parse(raw, composePath)
    entries = parsed.entries
    diagnostics = parsed.diagnostics
    composeLoadState = "ready"
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

  function saveFavorites() {
    favoritesFile.setText(JSON.stringify(favorites, null, 2) + "\n")
  }

  function warningCount() { return diagnostics.filter(function(item) { return item.severity === "warning" }).length }
  function errorCount() { return diagnostics.filter(function(item) { return item.severity === "error" }).length }

  function clearPreview() {
    previewDescription = ""
    previewSequence = ""
    previewResult = ""
    previewLine = 0
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
    previewLine = variant.line
  }

  function togglePreview() {
    if (!displayModel.count) return
    previewOpen = !previewOpen
    syncPreview()
  }

  function footerText() {
    var parts = ["↑/↓ navigate", "Ctrl+F favorite", "Tab variants"]
    if (displayModel.count) parts.push((selectedIndex + 1) + "/" + displayModel.count)
    if (previewOpen) parts.push("Full preview")
    if (errorCount()) parts.push(errorCount() + " conflict" + (errorCount() === 1 ? "" : "s"))
    else if (warningCount()) parts.push(warningCount() + " rule warning" + (warningCount() === 1 ? "" : "s"))
    return parts.join("  •  ")
  }

  function footerActionsText() {
    return previewOpen ? "Enter insert  •  Ctrl+C copy  •  Ctrl+P results  •  Esc results" : "Enter insert  •  Ctrl+C copy  •  Ctrl+P preview  •  Esc close"
  }

  function rebuildDisplay(resetSelection) {
    var selectedGroupId = !resetSelection && filteredGroups.length && selectedIndex < filteredGroups.length ? filteredGroups[selectedIndex].groupId : ""
    var groups = XComposeSearch.search(entries, filterText, history, favorites, 100)
    filteredGroups = groups
    displayModel.clear()
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i]
      var savedIndex = variantSelections[group.groupId]
      var variantIndex = typeof savedIndex === "number" ? Math.max(0, Math.min(savedIndex, group.variants.length - 1)) : group.activeVariantIndex
      var variant = group.variants[variantIndex]
      var match = XComposeSearch.matchEntry(variant, XComposeSearch.normalize(filterText)) || { descriptionRanges: [], resultRanges: [], sequenceRanges: [] }
      displayModel.append({ groupId: group.groupId, description: variant.descriptionPreview, descriptionMarkup: root.highlightMarkup(variant.descriptionPreview, match.descriptionRanges), preview: variant.valuePreview, previewMarkup: root.highlightMarkup(variant.valuePreview, match.resultRanges), sequenceMarkup: root.highlightMarkup(variant.sequencePreview, match.sequenceRanges), variants: group.variants.length, variantIndex: variantIndex, favorite: group.favorite })
    }
    if (!displayModel.count) { selectedIndex = 0; previewOpen = false; clearPreview(); return }
    var restored = -1
    for (var row = 0; row < displayModel.count; row++) if (displayModel.get(row).groupId === selectedGroupId) { restored = row; break }
    selectedIndex = resetSelection ? 0 : (restored >= 0 ? restored : Math.min(selectedIndex, displayModel.count - 1))
    syncPreview()
    Qt.callLater(function() { results.positionViewAtIndex(selectedIndex, ListView.Contain) })
  }

  function setFilter(value) { filterText = value; selectedIndex = 0; previewOpen = false; rebuildDisplay(true) }

  function select(delta) {
    if (!displayModel.count) return
    selectedIndex = (selectedIndex + delta + displayModel.count) % displayModel.count
    syncPreview()
    results.positionViewAtIndex(selectedIndex, ListView.Contain)
  }

  function selectAbsolute(index) {
    if (!displayModel.count) return
    selectedIndex = Math.max(0, Math.min(index, displayModel.count - 1))
    syncPreview()
    results.positionViewAtIndex(selectedIndex, ListView.Contain)
  }

  function cycleVariant(delta) {
    if (!displayModel.count) return
    var group = filteredGroups[selectedIndex]
    var current = displayModel.get(selectedIndex).variantIndex
    variantSelections[group.groupId] = (current + delta + group.variants.length) % group.variants.length
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
    if (index < 0 || index >= displayModel.count) return
    var variant = selectedVariant(index)
    if (!variant || !variant.result) return
    history = XComposeHistory.record(history, variant.id, Date.now(), 100)
    saveHistory()
    dismiss()
    Quickshell.execDetached(["bash", pluginDir + (copyOnly ? "/scripts/copy.sh" : "/scripts/insert.sh"), variant.result])
  }

  ListModel { id: displayModel }

  FileView {
    id: composeFile
    path: root.composePath
    watchChanges: true
    printErrors: false
    onLoaded: root.loadCompose(text())
    onFileChanged: reload()
    onLoadFailed: { root.composeLoadState = "missing"; root.entries = []; root.diagnostics = []; root.rebuildDisplay() }
  }

  FileView {
    id: favoritesFile
    path: root.favoritesPath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: root.loadFavorites(text())
    onLoadFailed: root.favorites = XComposeFavorites.empty()
  }

  FileView {
    id: historyFile
    path: root.historyPath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: root.loadHistory(text())
    onLoadFailed: root.history = XComposeHistory.empty()
  }

  Timer {
    interval: 1000
    repeat: true
    running: root.opened && root.composeLoadState === "missing"
    onTriggered: composeFile.reload()
  }

  Component.onCompleted: Quickshell.execDetached(["mkdir", "-p", stateDir])

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
          if (event.key === Qt.Key_Escape) { if (root.previewOpen) root.previewOpen = false; else if (root.filterText) root.setFilter(""); else root.dismiss() }
          else if (event.key === Qt.Key_F && (event.modifiers & Qt.ControlModifier)) root.toggleFavorite(root.selectedIndex)
          else if (event.key === Qt.Key_P && (event.modifiers & Qt.ControlModifier)) root.togglePreview()
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
            anchors.left: searchIcon.right
            anchors.leftMargin: Style.spacing.sm
            anchors.right: parent.right
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
            visible: !root.previewOpen
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
              text: root.previewSequence + (root.previewLine ? "  •  line " + root.previewLine : "")
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
              height: Math.max(0, parent.height - previewTitle.implicitHeight - previewMetadata.implicitHeight - previewPane.spacing * 2)
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
                  text: root.previewResult
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
            visible: !root.previewOpen && displayModel.count === 0
            spacing: Style.space(8)
            Text { width: parent.width; horizontalAlignment: Text.AlignHCenter; text: root.composeLoadState === "missing" ? "XCompose file not found" : root.entries.length ? "No matching shortcuts" : "No valid XCompose entries"; textFormat: Text.PlainText; color: root.foreground; opacity: 0.75; font.family: root.fontFamily; font.pixelSize: Style.font.title }
            Text { width: Math.min(implicitWidth, card.width - root.contentMargin * 2); horizontalAlignment: Text.AlignHCenter; text: root.composeLoadState === "missing" ? "Create " + root.composePath + " or set XCOMPOSEFILE" : root.composePath; textFormat: Text.PlainText; color: root.foreground; opacity: 0.52; font.family: root.fontFamily; font.pixelSize: Style.font.caption; elide: Text.ElideMiddle }
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
