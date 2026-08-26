import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "XComposeParser.js" as XComposeParser

Item {
  id: root

  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property string home: Quickshell.env("HOME")
  property var shell: null
  property var manifest: null

  readonly property string pluginId: manifest && manifest.id ? manifest.id : "dev.ilegna.xcompose"
  readonly property string pluginDir: manifest && manifest.__sourceDir
    ? manifest.__sourceDir
    : home + "/.config/omarchy/plugins/" + pluginId
  readonly property string defaultComposePath: Quickshell.env("XCOMPOSEFILE") || home + "/.XCompose"

  property string composePath: defaultComposePath
  property bool composeLoaded: false
  property bool opened: false
  property string filterText: ""
  property int selectedIndex: 0
  property bool cursorActive: false
  property var entries: []
  property var filteredEntries: []

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
  property int rowHeight: Math.max(Style.space(58), Style.font.title + Style.font.caption + Style.spacing.md)
  property int rowSpacing: Style.spacing.xs
  property int cardWidth: Math.min(Style.space(430), panel.width - Style.gapsOut * 2)
  property int cardHeight: Math.min(Style.space(500), panel.height - Style.gapsOut * 2)

  function open(payloadJson) {
    var payload = ({})
    try { payload = JSON.parse(payloadJson || "{}") } catch (_) { payload = ({}) }

    var requestedPath = typeof payload.path === "string" ? payload.path.trim() : ""
    root.composePath = requestedPath.charAt(0) === "/" ? requestedPath : root.defaultComposePath
    root.filterText = ""
    root.selectedIndex = 0
    root.cursorActive = false
    root.opened = true
    composeFile.reload()
    root.rebuildDisplay()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function close() {
    root.opened = false
  }

  function dismiss() {
    root.opened = false
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide(root.pluginId)
  }

  function load(raw) {
    root.composeLoaded = true
    root.entries = XComposeParser.parse(raw)
    root.rebuildDisplay()
  }

  function rebuildDisplay() {
    var filtered = XComposeParser.filter(root.entries, root.filterText, 100)
    root.filteredEntries = filtered

    displayModel.clear()
    for (var i = 0; i < filtered.length; i++) {
      var entry = filtered[i]
      displayModel.append({
        description: entry.descriptionPreview,
        preview: entry.valuePreview,
        sequence: entry.sequencePreview
      })
    }

    if (displayModel.count === 0) {
      root.selectedIndex = 0
      root.cursorActive = false
      return
    }

    root.selectedIndex = Math.min(root.selectedIndex, displayModel.count - 1)
    root.cursorActive = true
    Qt.callLater(function() {
      results.positionViewAtIndex(root.selectedIndex, ListView.Contain)
    })
  }

  function setFilter(value) {
    root.filterText = value
    root.selectedIndex = 0
    root.rebuildDisplay()
  }

  function select(delta) {
    if (displayModel.count === 0)
      return

    root.cursorActive = true
    var nextIndex = (root.selectedIndex + delta) % displayModel.count
    root.selectedIndex = (nextIndex + displayModel.count) % displayModel.count
    results.positionViewAtIndex(root.selectedIndex, ListView.Contain)
  }

  function activate(index) {
    if (index < 0 || index >= displayModel.count)
      return

    var value = root.filteredEntries[index].value
    if (!value)
      return

    root.dismiss()
    Quickshell.execDetached(["bash", root.pluginDir + "/scripts/insert.sh", value])
  }

  ListModel { id: displayModel }

  FileView {
    id: composeFile
    path: root.composePath
    watchChanges: true
    printErrors: false
    onLoaded: root.load(text())
    onFileChanged: reload()
    onLoadFailed: {
      root.composeLoaded = false
      root.entries = []
      root.rebuildDisplay()
    }
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

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

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
          if (event.key === Qt.Key_Escape) {
            if (root.filterText) root.setFilter("")
            else root.dismiss()
            event.accepted = true
          } else if (Util.editsFilter(event, root.filterText)) {
            root.setFilter(Util.editedFilter(event, root.filterText))
            event.accepted = true
          } else if (event.key === Qt.Key_Up) {
            root.select(-1)
            event.accepted = true
          } else if (event.key === Qt.Key_Down) {
            root.select(1)
            event.accepted = true
          } else if (event.key === Qt.Key_PageUp) {
            root.select(-Math.max(1, Math.floor(results.height / root.rowHeight)))
            event.accepted = true
          } else if (event.key === Qt.Key_PageDown) {
            root.select(Math.max(1, Math.floor(results.height / root.rowHeight)))
            event.accepted = true
          } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            if (root.cursorActive) root.activate(root.selectedIndex)
            event.accepted = true
          } else if (event.text && event.text.length === 1 && event.text.charCodeAt(0) >= 32 && event.text.charCodeAt(0) !== 127) {
            root.setFilter(root.filterText + event.text)
            event.accepted = true
          }
        }
      }

      Column {
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
        spacing: root.contentSpacing

        Rectangle {
          width: parent.width
          height: root.headerHeight
          radius: root.cornerRadius
          color: "transparent"

          Text {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            text: root.filterText || "Search XCompose shortcuts…"
            color: root.foreground
            opacity: root.filterText ? 1 : 0.58
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading
            elide: Text.ElideRight
          }
        }

        Item {
          width: parent.width
          height: parent.height - root.headerHeight - root.contentSpacing

          ListView {
            id: results
            anchors.fill: parent
            model: displayModel
            spacing: root.rowSpacing
            clip: true
            boundsBehavior: Flickable.StopAtBounds

            delegate: Rectangle {
              required property int index
              required property string description
              required property string preview
              required property string sequence

              readonly property bool hasCursor: root.cursorActive && index === root.selectedIndex

              width: results.width
              height: root.rowHeight
              radius: root.cornerRadius
              color: hasCursor ? root.selectedBackground : "transparent"
              clip: true

              Column {
                anchors.left: parent.left
                anchors.right: valueText.left
                anchors.verticalCenter: parent.verticalCenter
                anchors.leftMargin: Style.spacing.md
                anchors.rightMargin: Style.spacing.md
                spacing: Style.spacing.xs

                Text {
                  width: parent.width
                  text: description
                  color: hasCursor ? root.selectedText : root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  elide: Text.ElideRight
                  maximumLineCount: 1
                  wrapMode: Text.NoWrap
                }

                Text {
                  width: parent.width
                  text: sequence
                  color: hasCursor ? root.selectedText : root.foreground
                  opacity: 0.58
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  elide: Text.ElideRight
                  maximumLineCount: 1
                  wrapMode: Text.NoWrap
                }
              }

              Text {
                id: valueText
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.rightMargin: Style.spacing.md
                width: Math.min(implicitWidth, parent.width * 0.32)
                text: preview
                color: hasCursor ? root.selectedText : root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.title
                elide: Text.ElideRight
                maximumLineCount: 1
                wrapMode: Text.NoWrap
                horizontalAlignment: Text.AlignRight
              }

              MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onContainsMouseChanged: if (containsMouse) {
                  root.cursorActive = true
                  root.selectedIndex = index
                }
                onClicked: {
                  root.cursorActive = true
                  root.selectedIndex = index
                  root.activate(index)
                }
              }
            }
          }

          Column {
            anchors.centerIn: parent
            spacing: Style.space(8)
            visible: displayModel.count === 0

            Text {
              text: root.composeLoaded ? "No matching shortcuts" : "XCompose file not found"
              color: root.foreground
              opacity: 0.75
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              horizontalAlignment: Text.AlignHCenter
              width: parent.width
            }

            Text {
              text: root.composeLoaded ? root.composePath : "Create " + root.composePath + " or set XCOMPOSEFILE"
              color: root.foreground
              opacity: 0.52
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              horizontalAlignment: Text.AlignHCenter
              width: Math.min(implicitWidth, card.width - root.contentMargin * 2)
              elide: Text.ElideMiddle
            }
          }
        }
      }
    }
  }
}
