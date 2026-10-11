@echo off
setlocal
TITLE ClinicCore Workstation - Build & Launch

echo ================================================
echo    CLINICCORE WORKSTATION - BUILD AND LAUNCH
echo ================================================
echo.

:: Node.js and npm are required; the application does not need administrator rights.
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js LTS is required. Install it, reopen this window, and retry.
    exit /b 1
)
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm was not found. Reinstall Node.js LTS with npm enabled.
    exit /b 1
)

cd /d "%~dp0"
if not defined PORT set "PORT=3000"
if not exist "node_modules\tsx" (
    echo [SETUP] Installing application dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        exit /b 1
    )
)

if not exist "dist\server.cjs" (
    echo [BUILD] Creating production application...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Production build failed.
        exit /b 1
    )
)

echo [RUN] Starting ClinicCore server...
start "ClinicCore Server" /B node dist\server.cjs
timeout /t 2 /nobreak >nul
start "" "http://localhost:%PORT%"

echo.
echo The server is running. Keep this window open while using ClinicCore.
pause
endlocal
