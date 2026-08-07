@echo off
title Twisted Growers - Claude Bridge
cd /d "%~dp0"

REM  WHY THIS IS NOT JUST "node server.mjs".
REM
REM  The bridge already auto-starts at login. So double-clicking this shortcut
REM  usually happens when the bridge is ALREADY RUNNING - and the old version of
REM  this file just ran node again, which died instantly on "address already in
REM  use", printed a stack trace, and sat on "pause". It looked exactly like a
REM  crash. The bridge was fine the whole time.
REM
REM  Now it asks the bridge whether it is alive before starting a second one.

echo Checking whether the bridge is already running...
echo.

curl -s -m 3 http://127.0.0.1:8765/health >nul 2>&1
if %errorlevel%==0 (
  echo   The bridge is ALREADY RUNNING. Nothing to do.
  echo.
  echo   It starts by itself when Windows starts, so this is the normal state.
  echo   If the assistant still says "AI offline", the bridge is not the problem -
  echo   see bridge\SETUP.md, the section on checking from the browser Console.
  echo.
  pause
  exit /b 0
)

echo   Not running. Starting it now...
echo.
node server.mjs

echo.
echo   The bridge has stopped. If that was not deliberate, the message above says why.
pause
