@echo off
TITLE ClinicCore USB Deployment Prep Utility
SETLOCAL EnableDelayedExpansion

:: 1. DRIVE SELECTION
echo ====================================================
echo     ClinicCore - USB PREPARATION UTILITY
echo ====================================================
echo.
set /p "usb_drive=Enter your USB Drive Letter (e.g., E, F, G): "
set "usb_drive=%usb_drive%:"

if not exist "%usb_drive%\" (
    echo [ERROR] Drive %usb_drive% not found!
    pause
    exit /b
)

echo [INFO] Preparing USB drive: %usb_drive%

:: 2. FOLDER STRUCTURE CREATION
echo [INFO] Creating folder structure...
mkdir "%usb_drive%\Binaries" 2>nul
mkdir "%usb_drive%\Admin\Activator" 2>nul
mkdir "%usb_drive%\Database" 2>nul
mkdir "%usb_drive%\dist" 2>nul

:: 3. COPYING FILES
echo [INFO] Copying application files...

:: Copying Compiled Dist
if exist "dist" (
    xcopy "dist" "%usb_drive%\dist" /E /H /C /I /Y
) else (
    echo [WARN] 'dist' folder not found! Please run 'npm run build' first.
)

:: Copying Generator Script
if exist "Admin\Activator\generator.js" (
    copy "Admin\Activator\generator.js" "%usb_drive%\Admin\Activator\" /Y
)

:: Copying Master Bootstrapper
if exist "RUN_CLINIC_SERVER.BAT" (
    copy "RUN_CLINIC_SERVER.BAT" "%usb_drive%\" /Y
)

:: Copying SQL Schema
if exist "cliniccore_mysql_schema.sql" (
    copy "cliniccore_mysql_schema.sql" "%usb_drive%\Database\" /Y
)

echo.
echo ====================================================
echo [SUCCESS] USB Preparation Complete!
echo You can now eject the USB and run RUN_CLINIC_SERVER.BAT.
echo ====================================================
pause
