@echo off
cd /d "%~dp0"
node --no-warnings scripts\verify-db.js
pause
