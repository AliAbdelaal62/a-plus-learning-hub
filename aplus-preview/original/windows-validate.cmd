@echo off
setlocal
cd /d "%~dp0"
if not exist reports mkdir reports
set OUT=reports\windows-validation.txt
echo A+ Hub - Windows validation evidence > "%OUT%"
echo Started: %DATE% %TIME% >> "%OUT%"
echo ---- Windows version >> "%OUT%"
ver >> "%OUT%"
echo ---- Node / npm >> "%OUT%"
node --version >> "%OUT%" 2>&1
where node >> "%OUT%" 2>&1
call npm.cmd --version >> "%OUT%" 2>&1
echo ---- node:sqlite available? >> "%OUT%"
node --no-warnings -e "require('node:sqlite');console.log('node:sqlite OK')" >> "%OUT%" 2>&1
echo exit code: %ERRORLEVEL% >> "%OUT%"
echo ---- Ports 3000 / 3001 already in use? (empty = free) >> "%OUT%"
netstat -ano | findstr /R /C:":3000 " /C:":3001 " >> "%OUT%" 2>&1
echo ---- Persistence + isolation smoke test >> "%OUT%"
node --no-warnings tools\smoke.js >> "%OUT%" 2>&1
echo exit code: %ERRORLEVEL% >> "%OUT%"
echo ---- Full test suite (exit 77 inside = browser tests SKIPPED, which is NOT a pass) >> "%OUT%"
node --no-warnings tools\run-all.js >> "%OUT%" 2>&1
echo run-all exit code: %ERRORLEVEL% >> "%OUT%"
echo Finished: %DATE% %TIME% >> "%OUT%"
echo.
echo Done. Send me the file: %CD%\%OUT%
type "%OUT%" | findstr /I /C:"SUMMARY" /C:"exit code" /C:"SKIPPED" /C:"FAIL"
pause
