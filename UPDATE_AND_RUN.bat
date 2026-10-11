@echo off
setlocal
TITLE ClinicCore - Update & Launch
cd /d "%~dp0"

echo ================================================
echo    CLINICCORE - UPDATE AND LAUNCH
echo ================================================
echo.

echo [1/3] Pulling latest code from GitHub...
call git pull origin main
if errorlevel 1 (
    echo [WARNING] Git pull had issues, continuing with local build...
)

echo.
echo [2/3] Building latest application...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed! Check errors above.
    pause
    exit /b 1
)

echo.
echo [3/3] Starting ClinicCore server...
if not defined PORT set "PORT=3000"
start "ClinicCore Server" /B node dist\server.cjs
timeout /t 2 /nobreak >nul
start "" "http://localhost:%PORT%"

echo.
echo ClinicCore is running with latest updates!
echo Keep this window open while using ClinicCore.
pause
endlocal
