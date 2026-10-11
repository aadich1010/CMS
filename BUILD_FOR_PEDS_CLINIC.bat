@echo off
title CLINICCORE - BUILD PEDIATRICS CLINIC PACKAGE
color 0B
cd /d "%~dp0"

echo ======================================================================
echo       CLINICCORE - 1-CLICK PEDIATRICS CLINIC BUILD PIPELINE
echo ======================================================================
echo.
echo [1/2] Configuring Build Profile for Pediatrics (Child Health & EPI)...
call npx tsx scripts/set-specialty-profile.ts peds
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to set Pediatrics profile!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Compiling, Pruning Dead-Code, and Packaging Standalone Bundle...
call npx tsx scripts/package-workstation.ts
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Packaging failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ======================================================================
echo [SUCCESS] Pediatrics Clinic Release ready in [dist-release\]!
echo.
echo * Note: First-Boot Auto-Lock is enabled.
echo   You do NOT need the doctor's MAC address in advance.
echo   Just copy dist-release to the clinic PC and start it.
echo   It will lock itself to the clinic PC permanently on first launch!
echo ======================================================================
echo.
pause
