@echo off
TITLE ClinicCore Master Launch
:: Yeh script automatic mode mein chalegi
echo Starting ClinicCore...

:: Define Server IP (Hardcode kar dein yahan ya network scan karein)
set SERVER_IP=192.168.10.100

:: Run the server
start "" node dist/server.cjs

:: Auto-open browser
start "" http://%SERVER_IP%:3000

echo ClinicCore is running...
exit
