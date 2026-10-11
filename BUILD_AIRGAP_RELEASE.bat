@echo off
title CLINICCORE ENTERPRISE - AIR-GAPPED RELEASE COMPILER
color 0A
cd /d "%~dp0"

echo ======================================================================
echo    CLINICCORE EMR WORKSTATION V1.0 - AIR-GAPPED RELEASE PIPELINE
echo ======================================================================
echo.
echo Running Automated Build, Cryptographic Signing, and Assembly Pipeline...
echo.

call npx tsx scripts/package-workstation.ts
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Pipeline failed with error code %ERRORLEVEL%!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Standalone Air-Gapped Release Package successfully created in:
echo [dist-release\]
echo.
pause
