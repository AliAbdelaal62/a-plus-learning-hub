@echo off
cd /d "%~dp0"
node --no-warnings scripts\backup.js %1
pause
