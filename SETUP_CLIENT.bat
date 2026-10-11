@echo off
TITLE ClinicCore Client Connection
echo ========================================================
echo     ClinicCore - CLIENT CONNECTION SETUP
echo ========================================================
set /p SERVER_IP="Enter the Static Server IP Address configured on the Main PC: "

:: Generate appsettings.json for client
echo {"serverUrl": "http://%SERVER_IP%:3000"} > appsettings.json

echo.
echo [SUCCESS] Configuration created: http://%SERVER_IP%:3000
echo.
pause
