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

  property string composePath: ""
  property string composeLoadState: "loading"
  property bool opened: false
  property string filterText: ""
  property int selectedIndex: 0
  property bool cursorActive: false
  property var entries: []
  property var diagnostics: []
  property var filteredGroups: []
  property var history: XComposeHistory.empty()
  property var variantSelections: ({})

  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color border: Color.menu.border
  property var borderSpec: Border.surfaceSpec("menu", "border", border, Math.max(1, Style.space(2)))
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  readonly property int cornerRadius: Style.cornerRadius
  property string fontFamily: Style.font.menuFamily
  property int contentMargin: Style.spacing.panelPadding
  property int headerHeight: Math.max(Style.space(34), Style.font.title + Style.spacing.controlPaddingY * 2)
  property int contentSpacing: Style.spacing.md
  property int rowHeight: Math.max(Style.space(64), Style.font.title + Style.font.caption + Style.spacing.md)
  property int rowSpacing: Style.spacing.xs
  property int cardWidth: Math.min(Style.space(560), panel.width - Style.gapsOut * 2)
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
    cursorActive = false
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

  function descriptionMarkup(value, ranges) {
    var selected = {}
    ;(ranges || []).forEach(function(range) { for (var i = range.start; i < range.start + range.length; i++) selected[i] = true })
    var text = String(value || "")
    var output = ""
    for (var index = 0; index < text.length; index++) {
      var character = escapeMarkup(text.charAt(index))
      output += selected[index] ? "<b>" + character + "</b>" : character
    }
    return output
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

  function warningCount() { return diagnostics.filter(function(item) { return item.severity === "warning" }).length }
  function errorCount() { return diagnostics.filter(function(item) { return item.severity === "error" }).length }

  function rebuildDisplay() {
    var selectedGroupId = filteredGroups.length && selectedIndex < filteredGroups.length ? filteredGroups[selectedIndex].groupId : ""
    var groups = XComposeSearch.search(entries, filterText, history, 100)
    filteredGroups = groups
    displayModel.clear()
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i]
      var savedIndex = variantSelections[group.groupId]
      var variantIndex = typeof savedIndex === "number" ? Math.max(0, Math.min(savedIndex, group.variants.length - 1)) : group.activeVariantIndex
      var variant = group.variants[variantIndex]
      var match = XComposeSearch.matchEntry(variant, XComposeSearch.normalize(filterText)) || { descriptionRanges: [] }
      displayModel.append({ groupId: group.groupId, description: variant.descriptionPreview, descriptionMarkup: root.descriptionMarkup(variant.descriptionPreview, match.descriptionRanges), preview: variant.valuePreview, sequence: variant.sequencePreview, variants: group.variants.length, variantIndex: variantIndex })
    }
    if (!displayModel.count) { selectedIndex = 0; cursorActive = false; return }
    var restored = -1
    for (var row = 0; row < displayModel.count; row++) if (displayModel.get(row).groupId === selectedGroupId) { restored = row; break }
    selectedIndex = restored >= 0 ? restored : Math.min(selectedIndex, displayModel.count - 1)
    cursorActive = true
    Qt.callLater(function() { results.positionViewAtIndex(selectedIndex, ListView.Contain) })
  }

  function setFilter(value) { filterText = value; selectedIndex = 0; rebuildDisplay() }

  function select(delta) {
    if (!displayModel.count) return
    cursorActive = true
    selectedIndex = (selectedIndex + delta + displayModel.count) % displayModel.count
    results.positionViewAtIndex(selectedIndex, ListView.Contain)
  }

  function selectAbsolute(index) {
    if (!displayModel.count) return
    cursorActive = true
    selectedIndex = Math.max(0, Math.min(index, displayModel.count - 1))
    results.positionViewAtIndex(selectedIndex, ListView.Contain)
  }

  function cycleVariant(delta) {
    if (!displayModel.count) return
    var group = filteredGroups[selectedIndex]
    var current = displayModel.get(selectedIndex).variantIndex
    variantSelections[group.groupId] = (current + delta + group.variants.length) % group.variants.length
    rebuildDisplay()
  }

  function activate(index) {
    if (index < 0 || index >= displayModel.count) return
    var group = filteredGroups[index]
    var variant = group.variants[displayModel.get(index).variantIndex]
    if (!variant || !variant.result) return
    history = XComposeHistory.record(history, variant.id, Date.now(), 100)
    saveHistory()
    dismiss()
    Quickshell.execDetached(["bash", pluginDir + "/scripts/insert.sh", variant.result])
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
          if (event.key === Qt.Key_Escape) { if (root.filterText) root.setFilter(""); else root.dismiss() }
          else if (Util.editsFilter(event, root.filterText)) root.setFilter(Util.editedFilter(event, root.filterText))
          else if (event.key === Qt.Key_Up) root.select(-1)
          else if (event.key === Qt.Key_Down) root.select(1)
          else if (event.key === Qt.Key_Home) root.selectAbsolute(0)
          else if (event.key === Qt.Key_End) root.selectAbsolute(displayModel.count - 1)
          else if (event.key === Qt.Key_PageUp) root.select(-Math.max(1, Math.floor(results.height / root.rowHeight)))
          else if (event.key === Qt.Key_PageDown) root.select(Math.max(1, Math.floor(results.height / root.rowHeight)))
          else if (event.key === Qt.Key_Tab) root.cycleVariant(event.modifiers & Qt.ShiftModifier ? -1 : 1)
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

        Text {
          width: parent.width
          height: root.headerHeight
          verticalAlignment: Text.AlignVCenter
          text: root.filterText || "Search XCompose shortcuts…"
          textFormat: Text.PlainText
          color: root.foreground
          opacity: root.filterText ? 1 : 0.58
          font.family: root.fontFamily
          font.pixelSize: Style.font.heading
          elide: Text.ElideRight
        }

        Item {
          width: parent.width
          height: parent.height - root.headerHeight - root.contentSpacing - footer.implicitHeight

          ListView {
            id: results
            anchors.fill: parent
            model: displayModel
            spacing: root.rowSpacing
            clip: true
            reuseItems: true
            boundsBehavior: Flickable.StopAtBounds
            delegate: Rectangle {
              required property int index
              required property string descriptionMarkup
              required property string preview
              required property string sequence
              required property int variants
              readonly property bool hasCursor: root.cursorActive && index === root.selectedIndex
              width: results.width
              height: root.rowHeight
              radius: root.cornerRadius
              color: hasCursor ? root.selectedBackground : "transparent"
              clip: true
              Item {
                anchors.fill: parent
                anchors.margins: Style.spacing.md
                Item {
                  id: labelCell
                  anchors.left: parent.left; anchors.top: parent.top; anchors.bottom: parent.bottom; anchors.right: previewCell.left; anchors.rightMargin: Style.spacing.md
                  clip: true
                  Column {
                    width: parent.width
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.spacing.xs
                    Text { width: parent.width; text: descriptionMarkup; textFormat: Text.StyledText; color: hasCursor ? root.selectedText : root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.body; elide: Text.ElideRight; maximumLineCount: 1; wrapMode: Text.NoWrap }
                    Text { width: parent.width; text: sequence + (variants > 1 ? "  •  " + variants + " variants" : ""); textFormat: Text.PlainText; color: hasCursor ? root.selectedText : root.foreground; opacity: 0.58; font.family: root.fontFamily; font.pixelSize: Style.font.caption; elide: Text.ElideRight; maximumLineCount: 1; wrapMode: Text.NoWrap }
                  }
                }
                Item {
                  id: previewCell
                  width: Math.min(Style.space(160), parent.width * 0.34)
                  anchors.right: parent.right; anchors.top: parent.top; anchors.bottom: parent.bottom
                  clip: true
                  Text { anchors.fill: parent; text: preview; textFormat: Text.PlainText; color: hasCursor ? root.selectedText : root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.title; elide: Text.ElideRight; maximumLineCount: 1; wrapMode: Text.NoWrap; horizontalAlignment: Text.AlignRight; verticalAlignment: Text.AlignVCenter }
                }
              }
              MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onContainsMouseChanged: {
                  if (containsMouse) {
                    root.cursorActive = true
                    root.selectedIndex = index
                  }
                }
                onClicked: root.activate(index)
              }
            }
          }

          Column {
            anchors.centerIn: parent
            visible: displayModel.count === 0
            spacing: Style.space(8)
            Text { width: parent.width; horizontalAlignment: Text.AlignHCenter; text: root.composeLoadState === "missing" ? "XCompose file not found" : root.entries.length ? "No matching shortcuts" : "No valid XCompose entries"; textFormat: Text.PlainText; color: root.foreground; opacity: 0.75; font.family: root.fontFamily; font.pixelSize: Style.font.title }
            Text { width: Math.min(implicitWidth, card.width - root.contentMargin * 2); horizontalAlignment: Text.AlignHCenter; text: root.composeLoadState === "missing" ? "Create " + root.composePath + " or set XCOMPOSEFILE" : root.composePath; textFormat: Text.PlainText; color: root.foreground; opacity: 0.52; font.family: root.fontFamily; font.pixelSize: Style.font.caption; elide: Text.ElideMiddle }
          }
        }

        Text {
          id: footer
          width: parent.width
          text: root.errorCount() ? root.errorCount() + " conflict" + (root.errorCount() === 1 ? "" : "s") + " • run scripts/doctor" : root.warningCount() ? root.warningCount() + " rule warning" + (root.warningCount() === 1 ? "" : "s") : displayModel.count > 0 ? "Tab cycles variants • Esc closes" : ""
          textFormat: Text.PlainText
          color: root.foreground
          opacity: 0.52
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }
    }
  }
}
