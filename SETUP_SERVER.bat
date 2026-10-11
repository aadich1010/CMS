@echo off
TITLE ClinicCore LAN Server Setup
echo ========================================================
echo     ClinicCore - LAN SERVER CONFIGURATION
echo ========================================================
set /p IP_ADDR="Enter Static IP for this PC (e.g., 192.168.10.100): "

:: Configure static IP - Note: 'Ethernet' might need to be 'Wi-Fi' depending on user connection
netsh interface ip set address "Ethernet" static %IP_ADDR% 255.255.255.0 192.168.10.1

:: Open Port 3000
netsh advfirewall firewall add rule name="ClinicCore_Server" dir=in action=allow protocol=TCP localport=3000

echo.
echo [SUCCESS] Server is now configured at %IP_ADDR%
echo [SUCCESS] Port 3000 opened in Firewall.
echo.
pause
