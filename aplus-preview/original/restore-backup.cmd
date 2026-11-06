@echo off
cd /d "%~dp0"
echo Stop the server (close its window) before restoring.
if "%~1"=="" (node --no-warnings scripts\restore.js & pause & exit /b 0)
node --no-warnings scripts\restore.js %1 --yes
pause
