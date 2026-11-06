@echo off
cd /d "%~dp0"
if "%~1"=="" (echo Usage: migrate-dry-run.cmd "path\to\APlus-FullBackup-....json" & pause & exit /b 1)
echo DRY RUN: nothing is written to the database. A report is saved in the reports folder.
node --no-warnings scripts\migrate-legacy.js "%~1"
pause
