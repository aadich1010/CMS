@echo off
title CLINICCORE ENTERPRISE WORKSTATION
color 0B
cd /d "%~dp0"

echo Starting ClinicCore Enterprise Desktop Workstation...
set CLINIC_ALLOW_LAN=true
npx electron main.cjs
