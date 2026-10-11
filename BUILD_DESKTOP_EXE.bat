@echo off
title CLINICCORE ENTERPRISE - DESKTOP .EXE COMPILER
color 0A
cd /d "%~dp0"

echo ======================================================================
echo          CLINICCORE WORKSTATION - BUILD STANDALONE .EXE
echo ======================================================================
echo.
echo [1/3] Compiling Frontend (Vite) and Backend Server (esbuild)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build step failed! Please check errors above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Packaging Standalone Windows Portable Application...
call npx electron-builder build --win portable
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Electron packaging failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ======================================================================
echo [SUCCESS!] Standalone Executable created successfully!
echo Location: dist-desktop\ClinicCore-Workstation.exe
echo ======================================================================
echo.
pause
