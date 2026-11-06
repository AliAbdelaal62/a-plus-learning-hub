@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this again. & pause & exit /b 1)
for /f %%v in ('node -p "process.versions.node"') do set NODEV=%%v
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a==22&&b>=5)?0:1)" || (echo Node.js 22.5 or newer is required. You have %NODEV%. & pause & exit /b 1)
if "%APLUS_DB%"=="" set "APLUS_DB=%~dp0data\aplus.sqlite"
if not exist "%APLUS_DB%" (
  echo Existing academy database not found: %APLUS_DB%
  echo No empty academy will be created. Use Start Operations Demo.cmd for the preview.
  if not defined APLUS_NO_PAUSE pause
  exit /b 13
)
if "%APLUS_PORT%"=="" set APLUS_PORT=3000
node --no-warnings scripts\launch-check.js %APLUS_PORT%
set RC=%ERRORLEVEL%
if %RC%==10 (start "" "http://localhost:%APLUS_PORT%/" & echo Opened the running instance. & timeout /t 3 >nul & exit /b 0)
if not %RC%==0 (echo. & echo Not started. & pause & exit /b %RC%)
echo Starting A+ Hub on http://localhost:%APLUS_PORT%/  (this computer only). To stop: close this window or press Ctrl+C.
start "" /b cmd /c "timeout /t 2 >nul & start "" http://localhost:%APLUS_PORT%/"
node --no-warnings src\server.js
set RC=%ERRORLEVEL%
echo.
echo The server has stopped (exit code %RC%). Your data is saved in data\aplus.sqlite.
pause
exit /b %RC%
