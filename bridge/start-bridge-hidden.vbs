' Starts the Twisted Growers Claude bridge with no visible window.
' Used by the Startup shortcut so the bridge comes up with Windows.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
sh.Run "node """ & here & "\server.mjs""", 0, False
