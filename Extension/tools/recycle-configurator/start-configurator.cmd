@echo off
setlocal

set "TOOL_DIR=%~dp0"
set "URL=http://127.0.0.1:5177/"
set "NODE_EXE="
set "FALLBACK_NODE=C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe"

cd /d "%TOOL_DIR%"

where node >nul 2>nul
if not errorlevel 1 (
  node --version >nul 2>nul
  if not errorlevel 1 (
    set "NODE_EXE=node"
  )
)

if not defined NODE_EXE (
  if exist "%FALLBACK_NODE%" (
    "%FALLBACK_NODE%" --version >nul 2>nul
    if not errorlevel 1 (
      set "NODE_EXE=%FALLBACK_NODE%"
    )
  )
)

if not defined NODE_EXE (
  echo No working Node.js runtime was found.
  echo Tried normal node first.
  echo Fallback not available or not working:
  echo %FALLBACK_NODE%
  echo.
  echo Install Node.js or update this launcher with a valid local Node path.
  pause
  exit /b 1
)

echo Starting recycle configurator skeleton...
echo URL: %URL%
echo Node: %NODE_EXE%
echo.
echo Keep this window open while using the page.
echo Press Ctrl+C to stop the server.
echo.

start "" "%URL%"
"%NODE_EXE%" server.js

echo.
echo Recycle configurator server stopped.
pause
