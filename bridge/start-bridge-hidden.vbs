' Starts the Twisted Growers Claude bridge with no visible window.
' Used by the Startup shortcut so the bridge comes up with Windows, and by hand
' whenever the bridge needs restarting after a change to server.mjs.
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
'
' WHY IT STOPS THE OLD ONE FIRST. Owner, 8 August 2026, screenshot:
'   Line: 25   Error: Permission denied   Code: 800A0046
' Line 25 was MoveFile on bridge.log - and the bridge that was ALREADY RUNNING
' had that file open, so Windows refused, and the script died before it ever
' started anything. The restart could not work while a bridge was running, which
' is the only time anybody runs it.
'
' The consequence was worse than an error box. He changed server.mjs to allow
' web lookups, ran this, saw "Permission denied", and the OLD process kept
' answering - so Budz went on saying the web was "blocked for lack of
' permission" and the change looked like it had not worked.
'
' So: stop any bridge that is running, THEN roll the log, and never let the
' rolling of a log file stop a bridge from starting.
Option Explicit
Dim sh, fso, here, logFile, prevLog, wmi, procs, p, cmdLine, httpReq

' The same token the bridge authenticates with, read from the file beside it.
' Returns empty on any failure - a missing token means the polite request is
' simply refused and the kill below still happens.
Function ReadToken(folder)
  Dim f, tf
  ReadToken = ""
  On Error Resume Next
  Set f = CreateObject("Scripting.FileSystemObject")
  If f.FileExists(folder & "\token.txt") Then
    Set tf = f.OpenTextFile(folder & "\token.txt", 1)
    ReadToken = Trim(tf.ReadAll)
    tf.Close
  End If
  Err.Clear
  On Error GoTo 0
End Function

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here

' ---- 1. Stop any bridge already running --------------------------------------
' ASK FIRST, KILL SECOND. Stop-Process on Windows is TerminateProcess: the
' process is destroyed outright and Node never sees SIGTERM, so a job being
' answered at that moment is orphaned and the person waits the full ten-minute
' lease for a question that died instantly. Proved 8 Aug 2026 - killing the
' bridge produced no [shutdown] line in the log at all, because the handler
' never ran.
'
' So the bridge is asked over its own HTTP port to drain and exit. If it answers,
' in-flight work finishes properly. If it does not answer within a few seconds -
' hung, wedged, or already dead - it is killed, because a restart that can be
' refused is not a restart.
On Error Resume Next
Set httpReq = CreateObject("MSXML2.ServerXMLHTTP.6.0")
httpReq.setTimeouts 2000, 2000, 2000, 50000
httpReq.open "POST", "http://127.0.0.1:8765/shutdown", False
httpReq.setRequestHeader "x-tg-token", ReadToken(here)
httpReq.send ""
Err.Clear
On Error GoTo 0

' Matched on the command line rather than the image name: killing every node.exe
' on the machine would take out anything else the owner is running, which is not
' this script's business.
On Error Resume Next
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
If Err.Number = 0 Then
  Set procs = wmi.ExecQuery("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'node.exe'")
  For Each p In procs
    cmdLine = "" & p.CommandLine
    If InStr(1, cmdLine, "server.mjs", vbTextCompare) > 0 _
       And InStr(1, cmdLine, "bridge", vbTextCompare) > 0 Then
      sh.Run "taskkill /PID " & p.ProcessId & " /F", 0, True
    End If
  Next
End If
Err.Clear

' Give Windows a moment to release the port and the log file. Without this the
' new process can hit "address already in use" and exit immediately.
WScript.Sleep 1200

' ---- 2. Roll the previous run's log aside ------------------------------------
' So the file being read is always the CURRENT run and never a mixture of
' several. Wrapped in On Error Resume Next deliberately: if this fails for any
' reason the bridge must still start. A log file is a convenience; the bridge
' answering questions is the point, and that inversion is exactly what broke.
logFile = here & "\bridge.log"
prevLog = here & "\bridge.prev.log"
If fso.FileExists(logFile) Then
  If fso.FileExists(prevLog) Then fso.DeleteFile prevLog, True
  fso.MoveFile logFile, prevLog
End If
Err.Clear
On Error GoTo 0

' ---- 3. Start it ------------------------------------------------------------
' cmd /c is required for the > and 2>&1 redirection; window style 0 keeps it
' hidden. Append mode, because if the roll above failed we must not erase the
' evidence of why.
sh.Run "cmd /c node """ & here & "\server.mjs"" >> """ & logFile & """ 2>&1", 0, False
