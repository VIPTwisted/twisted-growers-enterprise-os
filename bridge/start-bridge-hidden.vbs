' Starts the Twisted Growers Claude bridge with no visible window.
' Used by the Startup shortcut so the bridge comes up with Windows.
'
' WHY THE REDIRECTION MATTERS.
' This used to be a bare sh.Run of node with window style 0 and NO output
' redirection. A hidden process whose stdout and stderr go nowhere cannot be
' diagnosed by anyone, ever. Every console.log in server.mjs, every crash
' message, every "address already in use" was discarded the instant it was
' written - so "the bridge is not working" had no evidence behind it in either
' direction, and the only way to learn anything was to stop it and start it
' again in a visible window.
'
' Everything now lands in bridge.log, which is what makes a failure readable.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here

' Roll the previous run's log aside rather than appending forever, so the file
' being read is always the CURRENT run and never a mixture of several.
logFile = here & "\bridge.log"
prevLog = here & "\bridge.prev.log"
If fso.FileExists(logFile) Then
  If fso.FileExists(prevLog) Then fso.DeleteFile prevLog, True
  fso.MoveFile logFile, prevLog
End If

' cmd /c is required for the > and 2>&1 redirection; window style 0 keeps it hidden.
sh.Run "cmd /c node """ & here & "\server.mjs"" > """ & logFile & """ 2>&1", 0, False
