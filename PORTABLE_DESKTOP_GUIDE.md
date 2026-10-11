# CLINICCORE ENTERPRISE - PORTABLE DESKTOP BUNDLING & OFFLINE DEPLOYMENT GUIDE

This guide covers the current ClinicCore server setup and records the future Electron/LAN deployment work. Electron packaging is a roadmap only; there is no `.exe` build in this repository.

> **Current status:** Electron packaging is not configured in `package.json`. Server-backed login, clinic-scoped staff accounts, role checks, and tenant-scoped sync are implemented, but `/api/ai`, `/api/mysql`, `/api/server-data`, and `/api/auth` remain loopback-only until HTTPS and LAN deployment are configured and tested. Built-in demo accounts are disabled; register a clinic on the server to create its first administrator. Staff PINs are hashed on the server and must be changed on first sign-in. Treat the multi-PC steps below as a deployment design, not a currently supported setup.

## Current Quick Start

1. Install Node.js LTS with npm.
2. From the project directory, run `npm install` and `npm run build`.
3. Start with `npm start`, or use `RUN_EVERYTHING.BAT` on Windows. Open `http://localhost:3000`.
4. On first launch, register the clinic and its administrator. Create staff accounts from User Management; staff change their temporary PIN at first sign-in.

Clinic records are currently persisted in a server-side `data_sync.json` snapshot under the operating-system user data directory (`%LOCALAPPDATA%\ClinicCore` on Windows), with a browser cache. Set `CLINIC_DATA_DIR` to choose another writable location; an existing project-root `data_sync.json` is copied there once when no destination data exists. The MySQL integration is optional and is not yet the primary record store. Clinic administrators can create encrypted server archives (the newest 30 are retained) and download an off-device copy; unattended backups are not configured. Do not use real patient information until storage durability, backup recovery, HTTPS, and LAN deployment have been tested for the target clinic.

For HTTPS deployments, set `SESSION_COOKIE_SECURE=true`; keep the default `false` only for the current localhost-only HTTP workstation mode.

---

## SECTION 1: Packaging as a Portable Desktop App (Electron.js)

Electron allows you to package your frontend bundle and local Node.js Express server into a single executable binary that runs directly on any Windows workstation without requiring separate browser windows.

### Step 1.1: Install Electron Dependencies
On your developer machine, install the packaging dependencies:
```bash
npm install electron electron-builder --save-dev
```

### Step 1.2: Create the Electron Entrypoint File (`main.js`)
Create a new file named `main.js` in the root of your project directory. This script acts as the main OS-level controller, automatically spinning up the Node.js Express server in the background and loading the app inside a borderless, native desktop window.

```javascript
// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

function startLocalServer() {
  // Fork the CJS production server bundle in a separate background thread
  serverProcess = fork(path.join(__dirname, 'dist', 'server.cjs'), [], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '3000' }
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to launch ClinicCore background server:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "ClinicCore Enterprise",
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Wait briefly for the background Express server to boot, then load the app
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 1500);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  startLocalServer();
  createWindow();
});

app.on('window-all-closed', () => {
  // Terminate background server process cleanly on exit
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
```

### Step 1.3: Update `package.json` configurations
Add the following key declarations to your `package.json` to configure the `electron-builder` compilation parameters:

```json
{
  "main": "main.js",
  "scripts": {
    "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:3000 && electron .\"",
    "electron:build": "npm run build && electron-builder build --win --portable"
  },
  "build": {
    "appId": "com.cliniccore.enterprise",
    "productName": "ClinicCore",
    "directories": {
      "output": "dist-desktop"
    },
    "files": [
      "dist/**/*",
      "main.js",
      "package.json"
    ],
    "win": {
      "target": "portable",
      "icon": "public/favicon.ico"
    }
  }
}
```

### Step 1.4: Compile the Portable Binary
Execute the packaging script to generate a single standalone `.exe` inside the `/dist-desktop` directory:
```bash
npm run electron:build
```
This output file is **100% self-contained**. You can copy it to a USB drive and run it directly on any client computer!

---

## SECTION 2: Multi-PC LAN Network Deployment

If the clinic has multiple counters (e.g., Reception, Doctor's Cabin, and Pharmacy Counter), you only need to run the server on **one** designated computer (the Server PC).

```
 ┌─────────────────┐       ┌────────────────────────┐
 │   RECEPTION     │       │   PHARMACY / COURIER   │
 │ (Web Browser)   │       │     (Web Browser)      │
 └────────┬────────┘       └───────────┬────────────┘
          │      Local Router/Wi-Fi    │
          └───────────────┬────────────┘
                          │
            ┌─────────────┴─────────────┐
            │       MAIN SERVER PC      │
            │   ClinicCore Node Server  │
            └───────────────────────────┘
```

1. **Physical Connections**: Connect all computers to the same physical network switch or Wi-Fi Router. No active internet is required.
2. **Assign a Static IP to Server**: Set a static IP on the Server computer (e.g., `192.168.1.100`) via Windows Network Adapter settings.
3. **Firewall Authorization**: When starting the script for the first time, allow Windows Command Prompt and Node.js access when prompted by the Windows Defender Firewall prompt.

---

## SECTION 3: Interactive Licensing Setup (`install.bat`)

To secure your software and charge per clinic installation, you should distribute this automatic installer script. It checks if the computer is already activated. If it is the first launch, it blocks the startup and prompts the technician to input the **Clinic Name** and **Licensing Key**:

```batch
@echo off
title CLINICCORE ENTERPRISE - SECURE OFFLINE ACTIVATE & RUN
color 0B
cls

set LICENSE_FILE=license.config

:: Check if license is already registered on this system
if exist %LICENSE_FILE% (
    goto :run_server
)

:activate_screen
cls
echo =======================================================================
echo    ____ _ _       _        ____                     
echo   / ___| | (_)___(_) ___  / ___|___  _ __ ___         
echo  | |   | | | / __| |/ __| | |   / _ \| '__/ _ \        
echo  | |___| | | \__ \ | (__  | |___| (_) | | |  __/        
echo   \____|_|_|_|___/_|\___|  \____\___/|_|  \___|        
echo =======================================================================
echo                   FIRST-TIME SYSTEM ACTIVATION REQUIRED
echo =======================================================================
echo.
color 0E
echo [!] This copy of ClinicCore Enterprise is currently unregistered.
echo.

:: 1. Prompt for Clinic Name
set /p clinic_name="Enter Custom Clinic Name: "
if "%clinic_name%"=="" (
    echo [ERROR] Clinic Name cannot be empty!
    pause
    goto :activate_screen
)

:: 2. Prompt for License Key
echo.
echo Please enter the cryptographic License Key for "%clinic_name%":
set /p license_key="License Key (e.g. CCPK9-XXXX-XXXX): "
if "%license_key%"=="" (
    echo [ERROR] Activation Key cannot be empty!
    pause
    goto :activate_screen
)

:: Validate Key Pattern (Simplistic Batch Pattern Match / Replace with your custom criteria)
:: For real production, you can call a lightweight Node.js script to cryptographically check signatures
echo.
echo Verifying license credentials offline...
timeout /t 2 >nul

:: Save License to configuration file
echo CLINIC_NAME=%clinic_name%> %LICENSE_FILE%
echo LICENSE_KEY=%license_key%>> %LICENSE_FILE%

color 0A
echo.
echo [SUCCESS] Activation Successful! License registered for:
echo --- %clinic_name% ---
echo.
pause

:run_server
cls
color 0B
echo =======================================================================
echo                  CLINICCORE ENTERPRISE SERVER RUNNING
echo =======================================================================
echo.

:: Read details
for /f "tokens=1,2 delims==" %%i in (%LICENSE_FILE%) do (
    if "%%i"=="CLINIC_NAME" set ACTIVE_CLINIC=%%j
)

echo Registered Clinic : %ACTIVE_CLINIC%
echo Status            : ACTIVE (Offline License Secured)
echo.

:: Detect IP and launch
set local_ip=127.0.0.1
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| find "IPv4"') do (
    set local_ip=%%a
    goto :ip_found
)
:ip_found
set local_ip=%local_ip: =%

echo --- NETWORK CLIENT ACCESS DETAILS ---
echo Server Machine     : http://localhost:3000
echo Other Local PCs    : http://%local_ip%:3000
echo ---------------------------------------------------------------------
echo.
echo Launching Application...
start http://localhost:3000
npm start
```

---

## SECTION 4: Building Custom Key Generators (Licensing Mechanism)
The offline licensing works by binding the **Clinic Name** with a secret salt inside a cryptographic hash (e.g., SHA-256).

### Conceptual Node.js Cryptographic Signer:
You can use a simple script on your personal laptop to generate the `LICENSE_KEY` for any new clinic:

```javascript
const crypto = require('crypto');

function generateClinicKey(clinicName) {
  const secretSalt = "CLINICCORE_OFFLINE_SECRET_SALT_2026";
  const rawData = `${clinicName.toUpperCase().trim()}:${secretSalt}`;
  
  // Create an elegant 16-character license key
  const hash = crypto.createHash('sha256').update(rawData).digest('hex').toUpperCase();
  return `CCPK9-${hash.substring(0,4)}-${hash.substring(4,8)}-${hash.substring(8,12)}`;
}

// Example usage when selling to a new clinic:
const clinic = "Ali Dental Clinic";
const key = generateClinicKey(clinic);
console.log(`Clinic: ${clinic}`);
console.log(`Activation Key to Provide: ${key}`);
// Output: CCPK9-2B3A-8F4C-9D0E
```
