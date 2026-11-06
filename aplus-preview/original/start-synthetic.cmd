@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this again. & pause & exit /b 1)
echo This opens FAKE test data only (data\synthetic.sqlite) on port 3001. Your real data is not touched.
set APLUS_DB=%~dp0data\synthetic.sqlite
node --no-warnings scripts\launch-check.js 3001
set RC=%ERRORLEVEL%
if %RC%==10 (start "" "http://localhost:3001/" & exit /b 0)
if not %RC%==0 (pause & exit /b %RC%)
start "" /b cmd /c "timeout /t 2 >nul & start "" http://localhost:3001/"
node --no-warnings scripts\start-synthetic.js
set RC=%ERRORLEVEL%
echo The synthetic server has stopped (exit code %RC%).
pause
exit /b %RC%
