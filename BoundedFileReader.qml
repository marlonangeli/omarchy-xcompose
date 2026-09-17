import Quickshell
import Quickshell.Io
import QtQuick

QtObject {
  id: reader

  property string scriptPath: ""
  property string path: ""
  property int limit: 0
  property var extraArgs: []

  property string output: ""
  property bool pending: false
  property string nextPath: ""
  property int nextLimit: 0
  property var nextArgs: []

  signal loaded(string text)
  signal failed(int exitCode)

  function read(targetPath, targetLimit, args) {
    var resolvedPath = targetPath === undefined ? reader.path : String(targetPath)
    var resolvedLimit = targetLimit === undefined ? reader.limit : targetLimit
    var resolvedArgs = args === undefined ? reader.extraArgs : args
    if (process.running) {
      reader.pending = true
      reader.nextPath = resolvedPath
      reader.nextLimit = resolvedLimit
      reader.nextArgs = resolvedArgs
      return
    }
    reader.pending = false
    reader.output = ""
    reader.path = resolvedPath
    reader.limit = resolvedLimit
    reader.extraArgs = resolvedArgs
    process.command = ["node", reader.scriptPath, resolvedPath, String(resolvedLimit)].concat(resolvedArgs || [])
    process.running = true
  }

  property Process process: Process {
    id: process
    running: false
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: reader.output = text
    }
    onExited: function(exitCode) {
      if (reader.pending) {
        var path = reader.nextPath
        var limit = reader.nextLimit
        var args = reader.nextArgs
        reader.pending = false
        Qt.callLater(function() { reader.read(path, limit, args) })
        return
      }
      if (exitCode === 0) reader.loaded(reader.output)
      else reader.failed(exitCode)
    }
  }
}
