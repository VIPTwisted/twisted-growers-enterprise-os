# Keeps the Twisted Growers bridge running. Idempotent: start it if it is not
# up, do nothing at all if it is.
#
# WHY THIS EXISTS, AND WHY THE OBVIOUS APPROACH DOES NOT WORK.
#
# The first attempt at supervision was a scheduled task running
# start-bridge-hidden.vbs with RestartCount 999. It looked right and superintended
# nothing. wscript launches node and EXITS IMMEDIATELY, so Task Scheduler sees
# its action complete successfully, marks the task finished, and has no process
# left to watch. When node died later there was nothing to restart.
#
# Proved on 8 Aug 2026: the bridge was killed and eight seconds later - and
# every second after - zero node processes were running. The supervisor I had
# just described in a commit message did not exist.
#
# So supervision is a POLL, not a restart policy. Every minute this asks one
# question - is a bridge running - and starts one if not. It cannot be fooled by
# a launcher that exits, it recovers from a hard kill, a crash, a reboot and a
# machine coming back from sleep, and running it twice is harmless.
#
# Matched on the command line, not the image name, so it never counts or kills
# an unrelated node process.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs  = Join-Path $here 'start-bridge-hidden.vbs'

$running = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
             Where-Object { $_.CommandLine -like '*server.mjs*' -and $_.CommandLine -like '*bridge*' })

if ($running.Count -gt 0) { exit 0 }

# Not running. Start it, and leave a line in the log saying the watchdog did it,
# so a bridge that keeps dying is visible as a pattern rather than looking like
# it has been up all along.
$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
Add-Content -Path (Join-Path $here 'bridge.log') -Encoding utf8 `
  -Value "[watchdog] $stamp bridge was not running; starting it."
& wscript.exe "`"$vbs`""
