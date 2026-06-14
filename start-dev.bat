@echo off
cd /d "%~dp0"

echo ============================================
echo  SoriBaro Screen Prototype
echo ============================================

echo.
echo [1/3] Stopping running dev server on port 5173...
set "KILLED="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  echo        - killing PID %%a
  taskkill /PID %%a /F >nul 2>&1
  set "KILLED=1"
)
if not defined KILLED echo        - no running server found

echo.
echo [2/3] Installing dependencies (npm install)...
call npm install
if errorlevel 1 (
  echo.
  echo [ERROR] npm install failed. Check the messages above.
  pause
  exit /b 1
)

echo.
echo [3/3] Starting dev server (npm run dev)...
echo        Open http://localhost:5173 in your browser.  ^(stop: Ctrl+C^)
echo.
call npm run dev
