// main.cjs - ClinicCore Standalone Desktop Entrypoint (Electron) v1.0
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const net = require('net');

// Native High-DPI hardware scaling
app.commandLine.appendSwitch('high-dpi-support', '1');

let mainWindow = null;
let serverProcess = null;
let activePort = 3000;

function checkPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

function checkClinicCoreHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function resolveActivePort() {
  const isHealthyOn3000 = await checkClinicCoreHealth(3000);
  if (isHealthyOn3000) {
    console.log('[ClinicCore] Existing healthy instance detected on port 3000.');
    return { port: 3000, alreadyRunning: true };
  }

  const is3000Free = await checkPortFree(3000);
  if (is3000Free) {
    return { port: 3000, alreadyRunning: false };
  }

  for (let candidate = 3001; candidate <= 3010; candidate++) {
    const isCandidateHealthy = await checkClinicCoreHealth(candidate);
    if (isCandidateHealthy) {
      console.log(`[ClinicCore] Existing healthy instance detected on port ${candidate}.`);
      return { port: candidate, alreadyRunning: true };
    }
    const isCandidateFree = await checkPortFree(candidate);
    if (isCandidateFree) {
      console.log(`[ClinicCore] Selected free port ${candidate}.`);
      return { port: candidate, alreadyRunning: false };
    }
  }

  return { port: 3000, alreadyRunning: false };
}

function startBackendServer(targetPort) {
  const serverPath = path.join(__dirname, 'dist', 'server.cjs');
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(targetPort);
  process.env.CLINIC_ALLOW_LAN = 'true';

  try {
    // Direct in-process launch provides the fastest boot and zero spawn issues
    require(serverPath);
    console.log(`[ClinicCore] Backend initialized in-process on port ${targetPort}.`);
  } catch (err) {
    console.error('[ClinicCore] In-process launch failed, falling back to fork:', err);
    try {
      serverProcess = fork(serverPath, [], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(targetPort),
          CLINIC_ALLOW_LAN: 'true',
          ELECTRON_RUN_AS_NODE: '1',
        },
        stdio: 'inherit',
      });
    } catch (forkErr) {
      console.error('[ClinicCore] Process fork failed:', forkErr);
    }
  }
}

function pollServerReady(port, onReady, maxRetries = 60) {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 1000 }, (res) => {
      if (res.statusCode === 200) {
        clearInterval(interval);
        onReady(true);
      }
    });

    req.on('error', () => {
      if (attempts >= maxRetries) {
        clearInterval(interval);
        onReady(false);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      if (attempts >= maxRetries) {
        clearInterval(interval);
        onReady(false);
      }
    });
  }, 250);
}

function getSplashHtml() {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ClinicCore Workstation v1.0</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0f172a;
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    user-select: none;
    overflow: hidden;
  }
  .card {
    text-align: center;
    padding: 40px;
    max-width: 480px;
    width: 90%;
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }
  .spinner {
    width: 56px;
    height: 56px;
    border: 4px solid #334155;
    border-top-color: #00A3A6;
    border-radius: 50%;
    animation: spin 0.9s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;
    margin: 0 auto 24px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .badge {
    display: inline-block;
    padding: 5px 14px;
    background: rgba(0, 163, 166, 0.15);
    border: 1px solid rgba(0, 163, 166, 0.4);
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    color: #5eead4;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 16px;
  }
  h1 { font-size: 22px; font-weight: 800; color: #ffffff; margin-bottom: 8px; letter-spacing: -0.02em; }
  p { font-size: 13px; color: #94a3b8; line-height: 1.5; }
  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00A3A6;
    margin-right: 6px;
    animation: pulse 1.5s infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
</head>
<body>
<div class="card">
  <div class="badge">Enterprise Medical Platform</div>
  <div class="spinner"></div>
  <h1>ClinicCore Workstation v1.0</h1>
  <p><span class="status-dot"></span>Starting Local Medical Server & EMR Database...</p>
</div>
</body>
</html>`)}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'ClinicCore Workstation v1.0',
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  mainWindow.maximize();

  // Load the Splash UI instantly so the user NEVER sees a blank white screen
  mainWindow.loadURL(getSplashHtml());
  mainWindow.show();

  // Toggle DevTools on F12 or Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function loadClinicApp() {
  if (!mainWindow) return;

  const appUrl = `http://127.0.0.1:${activePort}`;
  console.log(`[ClinicCore] Loading main interface at ${appUrl}`);
  mainWindow.loadURL(appUrl);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.warn(`[ClinicCore] Load failed (${errorCode}): ${errorDescription}. Retrying in 1.5s...`);
    setTimeout(() => {
      if (mainWindow) {
        mainWindow.loadURL(appUrl);
      }
    }, 1500);
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('ready', async () => {
    createWindow();

    try {
      const portInfo = await resolveActivePort();
      activePort = portInfo.port;

      if (!portInfo.alreadyRunning) {
        startBackendServer(activePort);
      }

      pollServerReady(activePort, (success) => {
        if (success) {
          loadClinicApp();
        } else {
          console.warn('[ClinicCore] Health check timed out, loading interface directly.');
          loadClinicApp();
        }
      });
    } catch (err) {
      console.error('[ClinicCore] App initialization error:', err);
      loadClinicApp();
    }
  });

  app.on('window-all-closed', () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch (e) {}
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch (e) {}
    }
  });
}
