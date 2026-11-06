@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org & pause & exit /b 1)
node --no-warnings tools\run-all.js
set RC=%ERRORLEVEL%
echo.
echo Test suite exit code: %RC%  (0 = everything that ran passed; read the SUMMARY line for anything SKIPPED, which is not a pass)
if /I not "%~1"=="nopause" pause
exit /b %RC%
