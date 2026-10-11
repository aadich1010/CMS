@echo off
title CLINICCORE ENTERPRISE - MULTI-PC LAN SERVER
color 0B
cd /d "%~dp0"

echo ======================================================================
echo          CLINICCORE WORKSTATION - MULTI-PC LAN LAUNCHER
echo ======================================================================
echo.
echo Detecting Local IP Address of this Server Host PC...
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0 ^| findstr /v "0.0.0.0.*0.0.0.0"') do (
    set LOCAL_IP=%%a
)

echo [OK] Server Host PC IP Address: %LOCAL_IP%
echo.
echo ----------------------------------------------------------------------
echo  CLINIC TERMINALS ACCESS URLS:
echo  1. Doctor Cabin PC:      http://%LOCAL_IP%:3000
echo  2. Reception Token PC:   http://%LOCAL_IP%:3000
echo  3. Pharmacy POS PC:      http://%LOCAL_IP%:3000
echo  4. Laboratory Desk PC:   http://%LOCAL_IP%:3000
echo ----------------------------------------------------------------------
echo.
echo Ensuring Windows Firewall allows Port 3000 for LAN clients...
netsh advfirewall firewall show rule name="ClinicCore Port 3000" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    netsh advfirewall firewall add rule name="ClinicCore Port 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
)

echo Starting ClinicCore Full-Stack Server on 0.0.0.0:3000...
echo.
set CLINIC_ALLOW_LAN=true
npm start
pause
