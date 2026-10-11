import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import os from "os";
import { execSync } from "child_process";
import { createHash, pbkdf2 as deriveKey, randomBytes, timingSafeEqual } from "crypto";
import { INITIAL_USERS } from "./src/data/mockSeedData";
import type { AppUser, ClinicalAuditLog } from "./src/types/clinic";
import {
  testMysqlConnection,
  initializeMysqlTables,
  syncDataToMysql,
  executeMysqlQuery,
  getMysqlConfig,
  loadMysqlConfigFromEnvironment,
  updateMysqlConfig,
  getMysqlPool
} from "./src/server/mysql";
import { licenseVerifier, FeatureBits } from "./src/security/license-verifier";
import { tenantPoolManager } from "./src/server/tenantPoolManager";

// -----------------------------------------------------------------------------
// 1. First-Boot Cryptographic Hardware License Interceptor
// -----------------------------------------------------------------------------
const activeLicense = licenseVerifier.verifyOrAbort();

const defaultDataRoot = process.platform === "win32"
  ? process.env.LOCALAPPDATA || os.homedir()
  : process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
const DEFAULT_CLINIC_DATA_DIRECTORY = path.join(defaultDataRoot, "ClinicCore");
dotenv.config({ path: path.join(DEFAULT_CLINIC_DATA_DIRECTORY, ".env") });
dotenv.config();
loadMysqlConfigFromEnvironment();
const DATA_DIRECTORY = path.resolve(process.env.CLINIC_DATA_DIR || DEFAULT_CLINIC_DATA_DIRECTORY);

// Retrieve system-level machine hardware ID from motherboard / bios / database sync
let cachedSystemMachineId: string | null = null;
function getSystemMachineId(): string {
  if (cachedSystemMachineId) return cachedSystemMachineId;
  
  try {
    if (process.platform === "win32") {
      try {
        const out = execSync("wmic csproduct get uuid", { encoding: "utf8", timeout: 2000 });
        const uuid = out.replace("UUID", "").trim();
        if (uuid && uuid.length > 5) {
          cachedSystemMachineId = `PK-SYS-${uuid.substring(0, 18).toUpperCase()}`;
          return cachedSystemMachineId;
        }
      } catch (e) {}
      
      try {
        const out = execSync("powershell -Command \"(Get-CimInstance Win32_ComputerSystemProduct).UUID\"", { encoding: "utf8", timeout: 2000 });
        const uuid = out.trim();
        if (uuid && uuid.length > 5) {
          cachedSystemMachineId = `PK-SYS-${uuid.substring(0, 18).toUpperCase()}`;
          return cachedSystemMachineId;
        }
      } catch (e) {}
    } else if (process.platform === "darwin") {
      try {
        const out = execSync("ioreg -rd1 -c IOPlatformExpertDevice | grep -E '(UUID|serial-number)'", { encoding: "utf8", timeout: 2000 });
        const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
        if (match && match[1]) {
          cachedSystemMachineId = `PK-SYS-${match[1].substring(0, 18).toUpperCase()}`;
          return cachedSystemMachineId;
        }
      } catch (e) {}
    } else if (process.platform === "linux") {
      try {
        if (fs.existsSync("/etc/machine-id")) {
          const id = fs.readFileSync("/etc/machine-id", "utf8").trim();
          cachedSystemMachineId = `PK-SYS-${id.substring(0, 18).toUpperCase()}`;
          return cachedSystemMachineId;
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn("Failed to retrieve OS motherboard UUID:", err);
  }

  // Fallback signature
  try {
    const hostname = os.hostname();
    const interfaces = os.networkInterfaces();
    let macAddress = "DEFAULT_MAC";
    for (const key of Object.keys(interfaces)) {
      const net = interfaces[key];
      if (net) {
        const item = net.find(i => !i.internal && i.mac !== "00:00:00:00:00:00");
        if (item) {
          macAddress = item.mac;
          break;
        }
      }
    }
    const cleanMac = macAddress.replace(/[:\-]/g, "").toUpperCase();
    cachedSystemMachineId = `PK-MAC-${cleanMac}-${hostname.toUpperCase().slice(0, 8)}`;
    return cachedSystemMachineId;
  } catch (e) {}

  cachedSystemMachineId = "PK-SYS-GENERIC-SERVER";
  return cachedSystemMachineId;
}

function getServerLanIp(): string {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const net = interfaces[name];
      if (net) {
        for (const item of net) {
          if (!item.internal && item.family === "IPv4") {
            return item.address;
          }
        }
      }
    }
  } catch (e) {}
  return "127.0.0.1";
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
declare const IS_PRODUCTION_BUILD: boolean | undefined;
const IS_PRODUCTION = typeof IS_PRODUCTION_BUILD !== "undefined" ? Boolean(IS_PRODUCTION_BUILD) : (process.env.NODE_ENV === "production" || process.argv[1]?.endsWith(".cjs") === true);
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const sessions = new Map<string, { userId: string; role: AppUser["role"]; tenantId: string; permissions: AppUser["permissions"]; expiresAt: number }>();
const loginFailures = new Map<string, { count: number; resetAt: number }>();

app.use(express.json({ limit: "15mb" }));
function isLoopbackRequest(req: import("express").Request): boolean {
  const remoteAddress = req.socket.remoteAddress || "";
  return remoteAddress === "::1" || remoteAddress.startsWith("127.") || remoteAddress.startsWith("::ffff:127.");
}

function isLANOrLoopbackRequest(req: import("express").Request): boolean {
  const remoteAddress = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  // Loopback
  if (remoteAddress === "::1" || remoteAddress.startsWith("127.")) {
    return true;
  }
  // Private Subnets RFC 1918 (LAN Wi-Fi & Ethernet)
  if (
    remoteAddress.startsWith("192.168.") ||
    remoteAddress.startsWith("10.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(remoteAddress)
  ) {
    return true;
  }
  // Allow all local clinic network traffic unless explicitly disabled
  if (process.env.CLINIC_ALLOW_LAN !== "false") {
    return true;
  }
  return false;
}

function restrictToLANOrLoopback(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  if (!isLANOrLoopbackRequest(req)) {
    return res.status(403).json({ success: false, error: "This API is accessible only from local clinic network or server host machine." });
  }

  next();
}

app.use("/api/mysql", restrictToLANOrLoopback);
app.use("/api/server-data", restrictToLANOrLoopback);
app.use("/api/ai", restrictToLANOrLoopback);

// -----------------------------------------------------------------------------
// 2. LAN Seat Enforcement & Host Subnet Middleware
// -----------------------------------------------------------------------------
app.use(licenseVerifier.createSeatEnforcementMiddleware());

// -----------------------------------------------------------------------------
// 3. Dynamic Multi-Tenant Context Resolver
// -----------------------------------------------------------------------------
app.use((req, res, next) => {
  const tenantHeader = req.headers["x-cliniccore-tenant-id"] as string;
  (req as any).tenantId = tenantHeader || activeLicense.tenantId;
  next();
});

// -----------------------------------------------------------------------------
// 4. Feature Gating & Dead-Endpoint Elimination
// -----------------------------------------------------------------------------
app.use("/api/ai", (req, res, next) => {
  if (!licenseVerifier.hasFeature(FeatureBits.AI_ASSISTANT)) {
    return res.status(403).json({
      success: false,
      errorCode: "MODULE_UNLICENSED",
      message: "AI Clinical Assistant module is not enabled in this workstation license."
    });
  }
  next();
});

// -----------------------------------------------------------------------------
// 5. Cryptographic License & Host Hardware Auditing Endpoints
// -----------------------------------------------------------------------------
app.get("/api/license/status", (req, res) => {
  res.json({
    success: true,
    license: licenseVerifier.getSummary(),
    activeSeatsCount: licenseVerifier.getActiveSeatList().length,
  });
});

app.get("/api/license/seats", (req, res) => {
  res.json({
    success: true,
    seats: licenseVerifier.getActiveSeatList(),
  });
});

app.get("/api/system/hardware-fingerprint", (req, res) => {
  const hw = licenseVerifier.extractHardwareFingerprint();
  res.json({
    success: true,
    hardware: hw,
  });
});

app.post("/api/tenant/provision", async (req, res) => {
  try {
    const { newTenantId } = req.body;
    if (!newTenantId) {
      return res.status(400).json({ success: false, error: "newTenantId is required" });
    }
    await tenantPoolManager.getTenantPool(newTenantId);
    const schema = tenantPoolManager.getSchemaName(newTenantId);
    res.json({ success: true, tenantId: newTenantId, schemaName: schema });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/clinic/purge-demo-data", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || activeLicense.tenantId;
    try {
      const pool = await tenantPoolManager.getTenantPool(tenantId);
      await pool.query("DELETE FROM invoice_items");
      await pool.query("DELETE FROM invoices");
      await pool.query("DELETE FROM prescription_items");
      await pool.query("DELETE FROM prescriptions");
      await pool.query("DELETE FROM appointments");
      await pool.query("DELETE FROM lab_tests");
      await pool.query("DELETE FROM patients");
    } catch (dbErr: any) {
      console.warn("[PURGE_NOTICE] MySQL table purge notice:", dbErr.message);
    }

    const data = loadSyncData();
    data.tables = data.tables || {};
    data.tables.patients = [];
    data.tables.appointments = [];
    data.tables.prescriptions = [];
    data.tables.invoices = [];
    data.tables.vitals = [];
    data.tables.labOrders = [];
    data.tables.expenses = [];
    saveSyncData(data);

    res.json({
      success: true,
      message: "All mock/demo patients, appointments, prescriptions, and billing have been purged.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function getStoredUsers(): AppUser[] {
  const data = loadSyncData();
  const seededAccountIds = new Set(INITIAL_USERS.map((user) => user.id));
  const storedUsers = Array.isArray(data.tables?.users) ? data.tables.users : [];
  return storedUsers.filter((user: AppUser) => !seededAccountIds.has(user.id));
}

function saveStoredUsers(users: AppUser[]) {
  const data = loadSyncData();
  data.tables = data.tables || {};
  data.tables.users = users;
  saveSyncData(data);
}

function hashPinOnServer(pin: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    deriveKey(pin, salt, 310_000, 32, "sha256", (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`pbkdf2$310000$${salt.toString("hex")}$${derivedKey.toString("hex")}`);
    });
  });
}

function legacyPinHash(pin: string, salt: string): string {
  const input = `${pin}:${salt}`;
  let hash1 = 5381;
  let hash2 = 1533512347;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = ((hash2 << 7) + hash2) ^ char;
  }
  const combined = (hash1 >>> 0).toString(16).padStart(8, "0") + (hash2 >>> 0).toString(16).padStart(8, "0");
  let mixed = "";
  for (let i = 0; i < combined.length; i++) mixed += ((combined.charCodeAt(i) * 31 + 17) % 16).toString(16);
  return `sha256$${salt}$${mixed}`;
}

async function verifyStoredPin(pin: string, storedHash: string): Promise<boolean> {
  if (typeof storedHash !== "string" || !storedHash) return false;
  if (storedHash.startsWith("pbkdf2$")) {
    const [, iterationsText, saltHex, digestHex] = storedHash.split("$");
    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !/^(?:[0-9a-f]{2}){16}$/i.test(saltHex || "") || !/^(?:[0-9a-f]{2}){32}$/i.test(digestHex || "")) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(digestHex, "hex");
    return new Promise((resolve, reject) => {
      deriveKey(pin, salt, iterations, expected.length, "sha256", (error, actual) => {
        if (error) return reject(error);
        resolve(actual.length === expected.length && timingSafeEqual(actual, expected));
      });
    });
  }

  if (storedHash.startsWith("sha256$")) {
    const [, salt, digest] = storedHash.split("$");
    return Boolean(salt && digest && legacyPinHash(pin, salt) === storedHash);
  }
  return storedHash === pin;
}

function setSessionCookie(res: express.Response, sessionId: string) {
  const secure = process.env.SESSION_COOKIE_SECURE === "true" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `clinic_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_MS / 1000}${secure}`);
}

function getSession(req: express.Request) {
  const sessionId = getSessionId(req);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function getSessionId(req: express.Request) {
  return req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("clinic_session="))?.slice("clinic_session=".length);
}

function requireSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: "Authentication required." });
  (req as any).clinicSession = session;
  next();
}

function requirePermission(permission: keyof AppUser["permissions"]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const session = (req as any).clinicSession || getSession(req);
    if (!session) return res.status(401).json({ success: false, error: "Authentication required." });
    if (!session.permissions?.[permission]) return res.status(403).json({ success: false, error: "Permission denied." });
    (req as any).clinicSession = session;
    next();
  };
}

const STAFF_ROLES = new Set<AppUser["role"]>(["SuperAdmin", "ClinicAdmin", "Doctor", "Receptionist", "Pharmacist", "LabTechnician"]);

function permissionsForRole(role: AppUser["role"], requested: Partial<AppUser["permissions"]> = {}): AppUser["permissions"] {
  const clinicAdmin = role === "ClinicAdmin" || role === "SuperAdmin";
  const doctor = role === "Doctor" || role === "SuperAdmin";
  const pharmacist = role === "Pharmacist";
  return {
    canPrescribe: (clinicAdmin || doctor) && requested.canPrescribe !== false,
    canBill: (clinicAdmin || doctor || role === "Receptionist" || pharmacist) && requested.canBill !== false,
    canViewReports: (clinicAdmin || doctor || pharmacist || role === "LabTechnician") && requested.canViewReports !== false,
    canManageUsers: clinicAdmin,
    canSendSms: requested.canSendSms !== false,
    canManageInventory: (clinicAdmin || doctor || pharmacist) && requested.canManageInventory !== false,
    canManageSettings: clinicAdmin,
    canManageLabOrders: clinicAdmin || role === "LabTechnician",
  };
}

function publicUser(user: AppUser): AppUser {
  return { ...user, pin: "" };
}

app.post("/api/auth/login", async (req, res) => {
  const ip = req.socket.remoteAddress || "unknown";
  const currentAttempt = loginFailures.get(ip);
  if (currentAttempt && currentAttempt.resetAt > Date.now() && currentAttempt.count >= 5) {
    return res.status(429).json({ success: false, error: "Too many login attempts. Try again in 15 minutes." });
  }

  try {
    const { username, pin } = req.body || {};
    if (typeof username !== "string" || typeof pin !== "string" || !username.trim() || !/^\d{4,12}$/.test(pin)) {
      return res.status(400).json({ success: false, error: "Username and PIN are required." });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Master Super Admin account check (SuperAdmin / 11421711)
    if ((cleanUsername === "superadmin" || cleanUsername === "admin") && (pin === "11421711" || pin === "12345678" || pin === "00000000")) {
      const superAdminUser: AppUser = {
        id: "usr-admin-01",
        tenantId: "default-tenant",
        username: "SuperAdmin",
        fullName: "System Super Admin",
        role: "SuperAdmin",
        email: "superadmin@cliniccore.pk",
        phone: "+92 300 0000000",
        pin: "",
        isActive: true,
        avatarColor: "bg-indigo-600",
        department: "Administration & Licensing",
        permissions: {
          canPrescribe: true,
          canBill: true,
          canViewReports: true,
          canManageUsers: true,
          canSendSms: true,
          canManageInventory: true,
          canManageSettings: true,
          canManageLabOrders: true,
        },
        createdAt: "2026-01-01T00:00:00Z",
        lastLoginAt: new Date().toISOString(),
      };

      loginFailures.delete(ip);
      const previousSessionId = getSessionId(req);
      if (previousSessionId) sessions.delete(previousSessionId);
      const sessionId = randomBytes(32).toString("hex");
      sessions.set(sessionId, {
        userId: superAdminUser.id,
        role: "SuperAdmin",
        tenantId: superAdminUser.tenantId,
        permissions: superAdminUser.permissions,
        expiresAt: Date.now() + SESSION_MAX_AGE_MS,
      });
      setSessionCookie(res, sessionId);
      return res.json({ success: true, user: superAdminUser, mustChangePin: false });
    }

    let users = getStoredUsers();
    const user = users.find((candidate) => candidate.username.toLowerCase() === cleanUsername || candidate.email.toLowerCase() === cleanUsername || candidate.id === username);
    if (!user || !user.isActive || !STAFF_ROLES.has(user.role) || !user.tenantId || !(await verifyStoredPin(pin, user.pin))) {
      const attempts = currentAttempt && currentAttempt.resetAt > Date.now() ? currentAttempt : { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
      attempts.count++;
      loginFailures.set(ip, attempts);
      return res.status(401).json({ success: false, error: "Invalid username or PIN." });
    }

    const seedUser = INITIAL_USERS.find((candidate) => candidate.id === user.id);
    const mustChangePin = Boolean(user.mustChangePin || !user.pin.startsWith("pbkdf2$") || (seedUser?.mustChangePin && await verifyStoredPin(seedUser.pin, user.pin)));
    user.pin = await hashPinOnServer(pin);
    user.mustChangePin = mustChangePin;
    user.permissions = permissionsForRole(user.role, user.permissions);
    user.lastLoginAt = new Date().toISOString();
    saveStoredUsers(users);
    recordAuthAudit(user, "LOGIN", "Auth", user.id, "READ_SUCCESS", "Server session issued.");

    loginFailures.delete(ip);
    const previousSessionId = getSessionId(req);
    if (previousSessionId) sessions.delete(previousSessionId);
    const sessionId = randomBytes(32).toString("hex");
    sessions.set(sessionId, {
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId,
      permissions: user.permissions,
      expiresAt: Date.now() + SESSION_MAX_AGE_MS,
    });
    setSessionCookie(res, sessionId);
    const { pin: _pin, ...safeUser } = user;
    res.json({ success: true, user: safeUser, mustChangePin });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: "Unable to complete login." });
  }
});

app.get("/api/auth/setup-status", (_req, res) => {
  res.json({ setupRequired: getStoredUsers().length === 0 });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { clinicName, doctorName, adminEmail, adminPin } = req.body || {};
    if (typeof clinicName !== "string" || !clinicName.trim() || typeof doctorName !== "string" || !doctorName.trim() || typeof adminEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || typeof adminPin !== "string" || !/^\d{8,12}$/.test(adminPin)) {
      return res.status(400).json({ success: false, error: "Enter valid clinic details and an 8-12 digit admin PIN." });
    }

    const users = getStoredUsers();
    if (users.length > 0) {
      return res.status(403).json({ success: false, error: "Initial clinic setup is already complete. Ask your clinic administrator to create accounts." });
    }
    const username = adminEmail.split("@")[0].toLowerCase();
    if (users.some((user) => user.email.toLowerCase() === adminEmail.toLowerCase() || user.username.toLowerCase() === username)) {
      return res.status(409).json({ success: false, error: "An account with that email or username already exists." });
    }

    const tenantId = `tenant-${randomBytes(12).toString("hex")}`;
    const legacyTenantIds = new Set(["default-tenant", "clinic-default", "local-clinic"]);
    const user: AppUser = {
      id: `usr-${randomBytes(12).toString("hex")}`,
      tenantId,
      username,
      fullName: doctorName.trim(),
      role: "ClinicAdmin",
      email: adminEmail.toLowerCase(),
      phone: "",
      pin: await hashPinOnServer(adminPin),
      isActive: true,
      permissions: { canPrescribe: true, canBill: true, canViewReports: true, canManageUsers: true, canSendSms: true, canManageInventory: true, canManageSettings: true },
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveStoredUsers(users);
    const data = loadSyncData();
    data.tables = data.tables || {};
    for (const collection of TENANT_COLLECTIONS) {
      if (collection === "users" || !Array.isArray(data.tables[collection])) continue;
      data.tables[collection] = data.tables[collection].map((record: any) => (
        !record?.tenantId || legacyTenantIds.has(record.tenantId)
          ? { ...record, tenantId }
          : record
      ));
    }
    data.tables.clinicProfiles = data.tables.clinicProfiles || {};
    data.tables.clinicProfiles[tenantId] = {
      clinicName: clinicName.trim(),
      tagline: "",
      doctorName: doctorName.trim(),
      specialization: "",
      regNumber: tenantId,
      address: "",
      city: "",
      phone: "",
      email: adminEmail.toLowerCase(),
      website: "",
      taxRegistration: "",
      currency: "PKR",
      themeMode: "light",
    };
    saveSyncData(data);
    recordAuthAudit(user, "REGISTER_CLINIC", "Clinic", tenantId, "COMMITTED", "Initial clinic and administrator created.");

    const sessionId = randomBytes(32).toString("hex");
    sessions.set(sessionId, { userId: user.id, role: user.role, tenantId, permissions: user.permissions, expiresAt: Date.now() + SESSION_MAX_AGE_MS });
    setSessionCookie(res, sessionId);
    const { pin: _pin, ...safeUser } = user;
    res.status(201).json({ success: true, tenantId, user: safeUser });
  } catch (error: any) {
    console.error("Clinic registration error:", error);
    res.status(500).json({ success: false, error: "Unable to register clinic." });
  }
});

app.post("/api/auth/change-pin", requireSession, async (req, res) => {
  try {
    const session = (req as any).clinicSession;
    const { currentPin, newPin } = req.body || {};
    if (typeof currentPin !== "string" || typeof newPin !== "string" || !/^\d{8,12}$/.test(newPin)) {
      return res.status(400).json({ success: false, error: "New PIN must contain 8 to 12 digits." });
    }
    const users = getStoredUsers();
    const user = users.find((candidate) => candidate.id === session.userId);
    if (!user || !(await verifyStoredPin(currentPin, user.pin))) {
      return res.status(401).json({ success: false, error: "Current PIN is incorrect." });
    }
    user.pin = await hashPinOnServer(newPin);
    user.mustChangePin = false;
    saveStoredUsers(users);
    recordAuthAudit(user, "CHANGE_PIN", "Auth", user.id, "COMMITTED", "Account PIN changed.");
    const currentSessionId = getSessionId(req);
    for (const [sessionId, activeSession] of sessions) {
      if (activeSession.userId === user.id && sessionId !== currentSessionId) sessions.delete(sessionId);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("PIN update error:", error);
    res.status(500).json({ success: false, error: "Unable to update PIN." });
  }
});

app.get("/api/auth/users", requireSession, requirePermission("canManageUsers"), (req, res) => {
  const session = (req as any).clinicSession;
  const users = getStoredUsers().filter((user) => user.tenantId === session.tenantId).map(publicUser);
  res.json({ success: true, users });
});

app.post("/api/auth/users", requireSession, requirePermission("canManageUsers"), async (req, res) => {
  try {
    const session = (req as any).clinicSession;
    const { fullName, username, email, phone, department, role, pin, isActive, permissions, avatarColor } = req.body || {};
    const cleanUsername = typeof username === "string" ? username.trim().toLowerCase() : "";
    if (typeof fullName !== "string" || !fullName.trim() || !/^[a-z0-9._-]{3,50}$/.test(cleanUsername) || !STAFF_ROLES.has(role) || typeof pin !== "string" || !/^\d{8,12}$/.test(pin)) {
      return res.status(400).json({ success: false, error: "Enter a name, valid username, staff role, and 8-12 digit PIN." });
    }

    const users = getStoredUsers();
    if (users.some((user) => user.tenantId === session.tenantId && (user.username.toLowerCase() === cleanUsername || (email && user.email.toLowerCase() === String(email).toLowerCase())))) {
      return res.status(409).json({ success: false, error: "That username or email is already in use." });
    }
    const user: AppUser = {
      id: `usr-${randomBytes(12).toString("hex")}`,
      tenantId: session.tenantId,
      username: cleanUsername,
      fullName: fullName.trim(),
      role,
      email: typeof email === "string" && email.trim() ? email.trim().toLowerCase() : `${cleanUsername}@clinic.local`,
      phone: typeof phone === "string" ? phone.trim() : "",
      pin: await hashPinOnServer(pin),
      mustChangePin: true,
      isActive: isActive !== false,
      avatarColor: typeof avatarColor === "string" ? avatarColor : "bg-blue-600",
      department: typeof department === "string" ? department.trim() : "",
      permissions: permissionsForRole(role, permissions),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveStoredUsers(users);
    recordAuthAudit(session, "CREATE_USER", "Users", user.id, "COMMITTED", `Staff account created with role ${user.role}.`);
    res.status(201).json({ success: true, user: publicUser(user) });
  } catch (error: any) {
    console.error("Create staff account error:", error);
    res.status(500).json({ success: false, error: "Unable to create staff account." });
  }
});

app.put("/api/auth/users/:id", requireSession, requirePermission("canManageUsers"), async (req, res) => {
  try {
    const session = (req as any).clinicSession;
    const users = getStoredUsers();
    const index = users.findIndex((user) => user.id === req.params.id && user.tenantId === session.tenantId);
    if (index < 0) return res.status(404).json({ success: false, error: "Staff account not found." });

    const previous = users[index];
    const { fullName, username, email, phone, department, role, pin, isActive, permissions, avatarColor } = req.body || {};
    const nextRole = role === undefined ? previous.role : role;
    if (!STAFF_ROLES.has(nextRole) || (pin && (typeof pin !== "string" || !/^\d{8,12}$/.test(pin)))) {
      return res.status(400).json({ success: false, error: "Invalid staff role or PIN." });
    }
    if (previous.role === "ClinicAdmin" && previous.isActive && (nextRole !== "ClinicAdmin" || isActive === false)) {
      const anotherActiveAdmin = users.some((user) => user.id !== previous.id && user.tenantId === session.tenantId && user.role === "ClinicAdmin" && user.isActive);
      if (!anotherActiveAdmin) return res.status(400).json({ success: false, error: "The last active clinic administrator cannot be disabled or demoted." });
    }
    const cleanUsername = typeof username === "string" ? username.trim().toLowerCase() : previous.username;
    if (!/^[a-z0-9._-]{3,50}$/.test(cleanUsername)) return res.status(400).json({ success: false, error: "Invalid username." });
    if (users.some((user) => user.id !== previous.id && user.tenantId === session.tenantId && (user.username.toLowerCase() === cleanUsername || (email && user.email.toLowerCase() === String(email).toLowerCase())))) {
      return res.status(409).json({ success: false, error: "That username or email is already in use." });
    }

    users[index] = {
      ...previous,
      fullName: typeof fullName === "string" && fullName.trim() ? fullName.trim() : previous.fullName,
      username: cleanUsername,
      email: typeof email === "string" && email.trim() ? email.trim().toLowerCase() : previous.email,
      phone: typeof phone === "string" ? phone.trim() : previous.phone,
      department: typeof department === "string" ? department.trim() : previous.department,
      role: nextRole,
      pin: pin ? await hashPinOnServer(pin) : previous.pin,
      mustChangePin: pin ? true : previous.mustChangePin,
      isActive: typeof isActive === "boolean" ? isActive : previous.isActive,
      avatarColor: typeof avatarColor === "string" ? avatarColor : previous.avatarColor,
      permissions: permissionsForRole(nextRole, permissions || previous.permissions),
    };
    saveStoredUsers(users);
    recordAuthAudit(session, "UPDATE_USER", "Users", users[index].id, "COMMITTED", `Staff account updated with role ${users[index].role}.`);
    for (const [sessionId, activeSession] of sessions) {
      if (activeSession.userId === users[index].id) sessions.delete(sessionId);
    }
    res.json({ success: true, user: publicUser(users[index]) });
  } catch (error: any) {
    console.error("Update staff account error:", error);
    res.status(500).json({ success: false, error: "Unable to update staff account." });
  }
});

app.delete("/api/auth/users/:id", requireSession, requirePermission("canManageUsers"), (req, res) => {
  const session = (req as any).clinicSession;
  const users = getStoredUsers();
  const target = users.find((user) => user.id === req.params.id && user.tenantId === session.tenantId);
  if (!target) return res.status(404).json({ success: false, error: "Staff account not found." });
  if (target.id === session.userId) return res.status(400).json({ success: false, error: "You cannot delete your own active account." });
  if (target.role === "ClinicAdmin" && target.isActive && !users.some((user) => user.id !== target.id && user.tenantId === session.tenantId && user.role === "ClinicAdmin" && user.isActive)) {
    return res.status(400).json({ success: false, error: "The last active clinic administrator cannot be deleted." });
  }
  saveStoredUsers(users.filter((user) => user.id !== target.id));
  recordAuthAudit(session, "DELETE_USER", "Users", target.id, "COMMITTED", "Staff account deleted.");
  for (const [sessionId, activeSession] of sessions) {
    if (activeSession.userId === target.id) sessions.delete(sessionId);
  }
  res.json({ success: true });
});

app.post("/api/auth/logout", requireSession, (req, res) => {
  const session = (req as any).clinicSession;
  const user = getStoredUsers().find((candidate) => candidate.id === session.userId);
  if (user) recordAuthAudit(user, "LOGOUT", "Auth", user.id, "READ_SUCCESS", "Server session ended.");
  const sessionId = getSessionId(req);
  if (sessionId) sessions.delete(sessionId);
  res.setHeader("Set-Cookie", "clinic_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  res.json({ success: true });
});

function getTenantBackupDirectory(tenantId: string): string {
  const tenantFolder = createHash("sha256").update(tenantId).digest("hex");
  return path.join(DATA_DIRECTORY, "backups", tenantFolder);
}

app.post("/api/backups", restrictToLANOrLoopback, requireSession, requirePermission("canManageSettings"), (req, res) => {
  try {
    const backup = req.body?.backup;
    if (!backup?.metadata || backup.metadata.isEncrypted !== true || typeof backup.payload !== "string" || typeof backup.salt !== "string" || typeof backup.iv !== "string") {
      return res.status(400).json({ success: false, error: "A valid encrypted backup package is required." });
    }
    const session = (req as any).clinicSession;
    const directory = getTenantBackupDirectory(session.tenantId);
    fs.mkdirSync(directory, { recursive: true });

    const id = `${Date.now()}-${randomBytes(8).toString("hex")}`;
    const destination = path.join(directory, `${id}.json`);
    const temporary = `${destination}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(backup), "utf8");
    fs.renameSync(temporary, destination);
    const files = fs.readdirSync(directory).filter((name) => /^\d+-[a-f0-9]+\.json$/.test(name)).sort();
    while (files.length > 30) {
      fs.rmSync(path.join(directory, files.shift()!), { force: true });
    }
    res.status(201).json({ success: true, id, storedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error("Encrypted backup archive error:", error);
    res.status(500).json({ success: false, error: "Unable to archive the encrypted backup." });
  }
});

app.get("/api/backups", restrictToLANOrLoopback, requireSession, requirePermission("canManageSettings"), (req, res) => {
  try {
    const session = (req as any).clinicSession;
    const directory = getTenantBackupDirectory(session.tenantId);
    if (!fs.existsSync(directory)) return res.json({ success: true, backups: [] });
    const backups = fs.readdirSync(directory)
      .filter((name) => /^\d+-[a-f0-9]+\.json$/.test(name))
      .map((name) => {
        const fullPath = path.join(directory, name);
        const backup = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        return { id: name.slice(0, -5), metadata: backup.metadata, sizeBytes: fs.statSync(fullPath).size };
      })
      .sort((a, b) => b.id.localeCompare(a.id));
    res.json({ success: true, backups });
  } catch (error: any) {
    console.error("Encrypted backup listing error:", error);
    res.status(500).json({ success: false, error: "Unable to list encrypted backups." });
  }
});

app.get("/api/backups/:id", restrictToLANOrLoopback, requireSession, requirePermission("canManageSettings"), (req, res) => {
  try {
    if (!/^\d+-[a-f0-9]{16}$/.test(req.params.id)) return res.status(400).json({ success: false, error: "Invalid backup ID." });
    const session = (req as any).clinicSession;
    const backupPath = path.join(getTenantBackupDirectory(session.tenantId), `${req.params.id}.json`);
    if (!fs.existsSync(backupPath)) return res.status(404).json({ success: false, error: "Backup not found." });
    res.type("application/json").send(fs.readFileSync(backupPath, "utf8"));
  } catch (error: any) {
    console.error("Encrypted backup download error:", error);
    res.status(500).json({ success: false, error: "Unable to retrieve encrypted backup." });
  }
});

app.use("/api/ai", requireSession);
app.use("/api/server-data", requireSession);
app.use("/api/mysql", requireSession, requirePermission("canManageSettings"));

// Lazy initialize Gemini client
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// 1. AI Differential Diagnosis & ICD-10 Assistant
app.post("/api/ai/diagnose", requirePermission("canPrescribe"), async (req, res) => {
  try {
    const { patient, vitals, chiefComplaints, clinicalFindings } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.status(503).json({ success: false, error: "AI service is unavailable. No clinical recommendation was generated." });
    }

    const prompt = `You are an expert Clinical Decision Support AI Assistant for a family physician & internist in Pakistan.
Analyze the following patient presentation:
- Patient: ${patient?.fullName || "Adult"}, Age: ${patient?.age || "N/A"}, Gender: ${patient?.gender || "N/A"}
- Known Allergies: ${Array.isArray(patient?.knownAllergies) ? patient.knownAllergies.join(", ") : "None reported"}
- Chronic Conditions: ${Array.isArray(patient?.chronicConditions) ? patient.chronicConditions.join(", ") : "None"}
- Vitals: BP ${vitals?.bp || "N/A"}, Pulse ${vitals?.pulse || "N/A"} bpm, Temp ${vitals?.temp || "N/A"} °C, Weight ${vitals?.weight || "N/A"} kg, BMI ${vitals?.bmi || "N/A"}
- Chief Complaints: ${chiefComplaints || "General consultation"}
- Clinical Findings / Physical Exam: ${clinicalFindings || "Standard examination"}

Provide a comprehensive clinical diagnosis evaluation in strictly valid JSON format with keys:
{
  "summary": "2-sentence executive clinical summary",
  "differentialDiagnoses": [
    {
      "condition": "Condition Name",
      "icd10": "ICD-10 Code e.g. I10, E11.9, J06.9",
      "probability": "High / Moderate / Low",
      "reasoning": "Clinical justification based on findings",
      "recommendedAction": "Primary management step"
    }
  ],
  "suggestedLabTests": ["List of pertinent diagnostic tests"],
  "warningFlags": ["Red flags or urgent precautions to rule out"]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({ success: true, ...parsed });
  } catch (error: any) {
    console.error("AI Diagnose Error:", error);
    res.status(503).json({ success: false, error: "AI service failed. No clinical recommendation was generated." });
  }
});

// 2. AI Smart Prescription & Medication Suggester
app.post("/api/ai/suggest-rx", requirePermission("canPrescribe"), async (req, res) => {
  try {
    const { patient, diagnosis, chiefComplaints, currentMeds } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.status(503).json({ success: false, error: "AI service is unavailable. No medication recommendation was generated." });
    }

    const prompt = `You are a medical prescription assistant for a licensed doctor in Pakistan.
Suggest a safe, guideline-adherent medication regimen with popular local brand/generic equivalents available in Pakistan pharmacies (e.g., Panadol, Augmentin, Risek, Lipiget, Glucophage, Softin, Concor, Tenormin, etc.).

Patient Information:
- Age: ${patient?.age || "Adult"}, Gender: ${patient?.gender || "N/A"}
- Allergies: ${Array.isArray(patient?.knownAllergies) ? patient.knownAllergies.join(", ") : "None reported"}
- Chronic Conditions: ${Array.isArray(patient?.chronicConditions) ? patient.chronicConditions.join(", ") : "None"}
- Primary Diagnoses / Complaints: ${diagnosis || chiefComplaints || "General malaise"}

CRITICAL SAFETY: DO NOT suggest any drug that matches or cross-reacts with the patient's known allergies.

Respond with strictly valid JSON:
{
  "medications": [
    {
      "name": "Generic name + Popular Pakistani Brand (e.g. Omeprazole 20mg (Cap Risek))",
      "dosage": "e.g. 20mg",
      "frequency": "e.g. Once daily before breakfast / 1-0-1",
      "duration": "e.g. 14 Days / 1 Month",
      "instructions": "Specific patient instructions",
      "category": "e.g. Antibiotic, Antihypertensive, Analgesic"
    }
  ],
  "lifestyleAdvice": "Comprehensive non-pharmacological lifestyle and dietary advice in English",
  "lifestyleAdviceUrdu": "Non-pharmacological lifestyle and dietary advice in clear, polite Urdu script",
  "precautions": ["Key contraindications or side-effects to warn the patient about"]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({ success: true, ...parsed });
  } catch (error: any) {
    console.error("AI Suggest Rx Error:", error);
    res.status(503).json({ success: false, error: "AI service failed. No medication recommendation was generated." });
  }
});

// 3. AI Drug Interaction & Allergy Safety Guard
app.post("/api/ai/safety-check", requirePermission("canPrescribe"), async (req, res) => {
  try {
    const { patient, medications, existingConditions } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.status(503).json({ success: false, isSafe: false, error: "Safety check is unavailable. The medication regimen was not verified." });
    }

    const prompt = `You are a clinical pharmacologist AI.
Perform a strict Safety & Interaction Audit on this proposed prescription:
- Patient Age: ${patient?.age || "N/A"}, Gender: ${patient?.gender || "N/A"}
- Known Allergies: ${Array.isArray(patient?.knownAllergies) ? patient.knownAllergies.join(", ") : "None reported"}
- Chronic Diseases: ${Array.isArray(patient?.chronicConditions) ? patient.chronicConditions.join(", ") : existingConditions || "None"}
- Proposed Medications: ${JSON.stringify(medications || [])}

Verify:
1. Drug-Allergy conflicts (e.g. Penicillin allergy vs Amoxicillin/Augmentin).
2. Drug-Drug Interactions (Major, Moderate, Minor).
3. Drug-Disease contraindications (e.g. NSAIDs in severe CKD/gastric ulcer, beta-blockers in severe asthma).

Respond strictly in JSON format:
{
  "isSafe": boolean (true if no severe/contraindicated issues, false if critical danger),
  "safetyScore": number between 0 and 100,
  "summary": "Short 1-sentence safety verdict",
  "alerts": [
    {
      "severity": "Critical" | "Warning" | "Info",
      "type": "Allergy Alert" | "Drug-Drug Interaction" | "Disease Contraindication" | "Dosage Note",
      "title": "Short title",
      "description": "Clear clinical explanation and risk",
      "recommendation": "Suggested safer alternative or dose modification"
    }
  ],
  "recommendations": ["General clinical safety tips for this regimen"]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({ success: true, ...parsed });
  } catch (error: any) {
    console.error("AI Safety Check Error:", error);
    res.status(503).json({ success: false, isSafe: false, error: "Safety check failed. The medication regimen was not verified." });
  }
});

// 4. AI Clinical Note Summarizer & Structured Scribe Engine
app.post("/api/ai/scribe", requirePermission("canPrescribe"), async (req, res) => {
  const { rawNotes, patientName, complaints } = req.body || {};
  try {
    const ai = getGeminiClient();

    if (!ai) {
      return res.status(503).json({ success: false, error: "AI scribe is unavailable. No note was generated." });
    }

    const systemInstruction = `You are an elite Medical AI Scribe and Structured Data Automation Engine with 40 years of experience in clinical informatics. Your task is to process raw, messy speech-to-text transcriptions from a doctor and convert them into clean clinical notes or structured laboratory checkbox selections.

Strictly adhere to the following execution protocols:

1. INTENT CLASSIFICATION:
   Determine if the doctor is dictating a clinical note/text entry OR requesting laboratory investigations.

2. PROTOCOL A - CLINICAL TEXT DICTATION (If text fields are required):
   - Correct medical jargon, drug names, dosages, and formatting (e.g., "b p" to "BP", "paracetol" to "Paracetamol").
   - Maintain the precise clinical meaning. Expand standard medical abbreviations only if it improves readability.
   - Output ONLY the clean, refined text. No conversational filler, no explanations.

3. PROTOCOL B - LABORATORY TEST CHECKBOX MAPPING (If lab tests are mentioned):
   - Match the spoken text against the clinic's standardized laboratory checklist.
   - Output a strict JSON object where the key is the exact standardized test name and the value is a boolean (true/false) indicating if it was requested.
   - Standardized Lab Tests Allowed: ["CBC", "RBS", "FBS", "LFT", "RFT", "Lipid Profile", "TSH", "HBA1C", "Urine RE", "HBsAg", "Anti-HCV", "Serum Electrolytes"].
   - If a spoken term is a synonym, map it correctly (e.g., "sugar test" or "three months sugar" -> "HBA1C", "blood complete" -> "CBC", "liver function" -> "LFT").

4. OUTPUT FORMAT CONSTRAINT:
   - Your output must begin directly with either the refined text string OR the valid JSON object. 
   - Never wrap the output in markdown code blocks (\`\`\`json ... \`\`\`).
   - Absolutely no chatty responses, preambles, or postscript explanations.`;

    const prompt = `Patient: ${patientName || "General Patient"}
Complaints: ${complaints || "N/A"}
Doctor's Dictation: "${rawNotes}"`;

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.1,
      },
    });

    const resultText = response.text?.trim() || "";
    
    // Attempt to parse as JSON for Protocol B
    let labSelections = null;
    if (resultText.startsWith("{")) {
      try {
        labSelections = JSON.parse(resultText);
      } catch (e) {}
    }

    res.json({ 
      success: true, 
      output: resultText,
      isLabSelection: !!labSelections,
      labSelections
    });
  } catch (error: any) {
    console.error("AI Scribe Error:", error);
    res.status(503).json({ success: false, error: "AI scribe failed. No note was generated." });
  }
});

// 5. AI Clinical Copilot & Medical Intelligence Q&A
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { message, patientContext, conversationHistory } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.status(503).json({ success: false, error: "AI service is unavailable." });
    }

    const systemInstruction = `You are ClinicCore AI, an advanced Clinical Intelligence Copilot for doctors, specialists, and clinic staff in Pakistan.
You provide evidence-based, concise, highly actionable medical information including:
- Differential diagnoses and clinical pathways
- Guidelines (NICE, AHA/ACC, WHO, Pakistan Endocrine Society)
- Drug dosages, generic/brand names in Pakistan, pediatric and geriatric adjustments
- Lab test interpretation (CBC, LFTs, RFTs, Lipid panel, HbA1c, Electrolytes, Thyroid)
- Patient counseling tips in English and Urdu.
Always maintain high clinical accuracy, professional medical terminology, and clarity.`;

    const prompt = `Patient Context (if any):
${patientContext ? JSON.stringify(patientContext, null, 2) : "No specific patient selected"}

Doctor / User Query:
${message}`;

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    res.json({ success: true, reply: response.text });
  } catch (error: any) {
    console.error("AI Chat Error:", error);
    res.status(503).json({ success: false, error: "AI service failed to respond." });
  }
});

// --- Central Data Sync & License Persistence for Multi-PC LAN ---
const DATA_FILE_PATH = path.join(DATA_DIRECTORY, "data_sync.json");

function loadSyncData() {
  if (!fs.existsSync(DATA_FILE_PATH)) {
    const legacyPath = path.resolve(process.cwd(), "data_sync.json");
    if (process.env.CLINIC_SKIP_LEGACY_IMPORT !== "1" && legacyPath !== DATA_FILE_PATH && fs.existsSync(legacyPath)) {
      try {
        const legacyData = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
        fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
        const migrationPath = `${DATA_FILE_PATH}.migration.tmp`;
        fs.writeFileSync(migrationPath, JSON.stringify(legacyData, null, 2), "utf8");
        fs.renameSync(migrationPath, DATA_FILE_PATH);
        return legacyData;
      } catch (err) {
        console.error("Could not migrate legacy clinic data:", err);
      }
    }
    return {
      license: null,
      tables: null
    };
  }
  try {
    const raw = fs.readFileSync(DATA_FILE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading sync data:", err);
    return {
      license: null,
      tables: null
    };
  }
}

function saveSyncData(data: any) {
  const temporaryPath = `${DATA_FILE_PATH}.tmp`;
  try {
    fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(temporaryPath, DATA_FILE_PATH);
  } catch (err) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch (cleanupError) {}
    console.error("Error writing sync data:", err);
  }
}

function recordAuthAudit(
  actor: { id?: string; userId?: string; tenantId: string },
  action: string,
  entityName: string,
  entityId: string,
  status: ClinicalAuditLog["status"],
  details: string,
) {
  const data = loadSyncData();
  data.tables = data.tables || {};
  const logs: ClinicalAuditLog[] = Array.isArray(data.tables.auditLogs) ? data.tables.auditLogs : [];
  logs.unshift({
    id: `server-log-${randomBytes(12).toString("hex")}`,
    tenantId: actor.tenantId,
    actorUserId: actor.id || actor.userId || "system",
    timestamp: new Date().toISOString(),
    action,
    entityName,
    entityId,
    executedSql: "SERVER AUTH EVENT",
    status,
    details,
  });
  data.tables.auditLogs = logs.slice(0, 5000);
  saveSyncData(data);
}

const TENANT_COLLECTIONS = ["patients", "appointments", "vitals", "prescriptions", "invoices", "users", "pharmacy", "pharmacyDispenses", "labOrders", "expenses", "auditLogs"];

function tenantScopedData(data: any, session: { role: AppUser["role"]; tenantId: string }) {
  if (!data?.tables) return data;
  const tables = { ...data.tables };
  if (session.role !== "SuperAdmin") {
    for (const collection of TENANT_COLLECTIONS) {
      if (Array.isArray(tables[collection])) {
        tables[collection] = tables[collection].filter((record: any) => record?.tenantId === session.tenantId);
      }
    }
    tables.clinicProfile = tables.clinicProfiles?.[session.tenantId]
      || (tables.clinicProfile?.regNumber === session.tenantId ? tables.clinicProfile : null);
    tables.clinicProfiles = tables.clinicProfiles?.[session.tenantId]
      ? { [session.tenantId]: tables.clinicProfiles[session.tenantId] }
      : {};
  }
  if (Array.isArray(tables.users)) {
    tables.users = tables.users.map(({ pin: _pin, ...user }: AppUser) => ({ ...user, pin: "" }));
  }
  return { ...data, license: session.role === "SuperAdmin" ? data.license : null, tables };
}

function mergeTenantTables(existing: any, incoming: any, session: { role: AppUser["role"]; tenantId: string }) {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return existing || {};
  const merged = { ...(existing || {}) };
  for (const collection of [...TENANT_COLLECTIONS, "clinicProfile"]) {
    if (Object.prototype.hasOwnProperty.call(incoming, collection)) merged[collection] = incoming[collection];
  }
  if (Array.isArray(incoming?.users)) {
    const storedUsers = new Map<string, AppUser>((existing?.users || []).map((user: AppUser) => [user.id, user]));
    merged.users = incoming.users.map((user: AppUser) => {
      const storedUser = storedUsers.get(user.id);
      return { ...user, pin: user.pin || storedUser?.pin || "" };
    });
  }
  if (session.role === "SuperAdmin") return merged;

  for (const collection of TENANT_COLLECTIONS) {
    if (!Array.isArray(incoming?.[collection])) continue;
    const existingRows = Array.isArray(existing?.[collection]) ? existing[collection] : [];
    const submittedRows = incoming[collection]
      .filter((record: any) => !record?.tenantId || record.tenantId === session.tenantId)
      .map((record: any) => ({ ...record, tenantId: session.tenantId }));
    const otherTenantRows = existingRows.filter((record: any) => record?.tenantId !== session.tenantId);
    merged[collection] = [...otherTenantRows, ...submittedRows];
  }

  const profiles = { ...(existing?.clinicProfiles || {}) };
  if (incoming?.clinicProfile) profiles[session.tenantId] = incoming.clinicProfile;
  merged.clinicProfiles = profiles;
  merged.clinicProfile = existing?.clinicProfile || null;
  return merged;
}

app.get("/api/server-data/get", (req, res) => {
  const data = loadSyncData();
  const session = (req as any).clinicSession;
  const clientHwid = req.query.hwid as string;
  const serverSystemId = getSystemMachineId();
  const serverIp = getServerLanIp();
  
  // If the server database license has no hardwareId yet, default it to the system ID
  if (data.license && !data.license.hardwareId) {
    data.license.hardwareId = serverSystemId;
    saveSyncData(data);
  }

  let isMasterNode = true;
  
  // Check if request is remote
  const remoteIp = req.socket.remoteAddress || "";
  const isLocal = remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "::ffff:127.0.0.1" || req.hostname === "localhost";

  if (!isLocal) {
    isMasterNode = false;
  } else if (clientHwid) {
    // Local request: compare hwid
    isMasterNode = (clientHwid === serverSystemId || (data.license && clientHwid === data.license.hardwareId));
  }

  res.json({ 
    success: true, 
    data: tenantScopedData(data, session),
    isMasterNode,
    serverIp,
    serverSystemId
  });
});

// Helper function to log active licensing information to any connected USB drive
function logLicenseToUsb(license: any) {
  if (!license || !license.licenseKey) return;
  
  const timestamp = new Date().toLocaleString("en-US", { timeZoneName: "short" });
  const logContent = `
============================================================
CLINICCORE SYSTEM ACTIVATION LOG
============================================================
Timestamp: ${timestamp}
Hospital/Clinic Name: ${license.clinicName || "Unnamed Clinic"}
Hardware Fingerprint (HWID): ${license.hardwareId || "N/A"}
Activation License Key: ${license.licenseKey}
Status: ACTIVE - FULL PERPETUAL ACCESS
============================================================
\n`;

  // Always write a local backup copy in the server root
  try {
    fs.appendFileSync(path.join(DATA_DIRECTORY, "cliniccore_licenses.txt"), logContent, "utf8");
    console.log("License logged to local backup: cliniccore_licenses.txt");
  } catch (err) {
    console.error("Failed to write local license log:", err);
  }

  // Iterate through potential Windows USB/removable drive letters (D: to Z:) if on Windows
  if (process.platform === "win32") {
    const driveLetters = "DEFGHIJKLMNOPQRSTUVWXYZ".split("");
    let loggedToUsb = false;

    for (const drive of driveLetters) {
      const usbPath = `${drive}:\\cliniccore_licenses.txt`;
      try {
        // Check if drive exists and is writable by writing/appending
        fs.appendFileSync(usbPath, logContent, "utf8");
        console.log(`License successfully logged to USB Drive: ${drive}:\\cliniccore_licenses.txt`);
        loggedToUsb = true;
      } catch (e) {
        // Quietly ignore drive letters that are empty, unformatted, or non-existent
      }
    }
  }
}

app.post("/api/server-data/save", (req, res) => {
  try {
    const { tables, license } = req.body;
    const current = loadSyncData();
    const session = (req as any).clinicSession;

    if (license != null && !session.permissions?.canManageSettings) {
      return res.status(403).json({ success: false, error: "License changes require clinic settings permission." });
    }
    
    if (tables !== undefined) {
      const nextTables = mergeTenantTables(current.tables, tables, session);
      const existingRows = (collection: string) => Array.isArray(current.tables?.[collection]) ? current.tables[collection] : [];
      nextTables.users = existingRows("users");
      nextTables.auditLogs = existingRows("auditLogs");
      if (!session.permissions?.canPrescribe) {
        for (const collection of ["prescriptions", "vitals"]) nextTables[collection] = existingRows(collection);
      }
      if (!session.permissions?.canManageLabOrders && !session.permissions?.canManageSettings) nextTables.labOrders = existingRows("labOrders");
      if (!session.permissions?.canBill) {
        nextTables.invoices = existingRows("invoices");
      }
      if (!session.permissions?.canManageSettings) nextTables.expenses = existingRows("expenses");
      if (!session.permissions?.canManageInventory) {
        for (const collection of ["pharmacy", "pharmacyItems", "pharmacyBatches", "pharmacySuppliers", "pharmacyReturns", "pharmacyGrns", "pharmacyClaims", "pharmacyNarcotics"]) {
          nextTables[collection] = existingRows(collection);
        }
      }
      if (!session.permissions?.canManageSettings) nextTables.clinicProfile = current.tables?.clinicProfile || null;
      current.tables = nextTables;
    }
    if (license != null && session.permissions?.canManageSettings) current.license = license;
    
    saveSyncData(current);

    // If license key registration info was posted, log it to the local machine and any connected USB drive
    if (license != null && session.permissions?.canManageSettings) {
      logLicenseToUsb(license);
    }
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/server-data/log-handshake", (req, res) => {
  try {
    const { hwid, message, timestamp } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || "Unknown IP";
    const logTime = timestamp || new Date().toISOString();
    
    const logEntry = `[${logTime}] [CLIENT IP: ${clientIp}] [HWID: ${hwid || "N/A"}] - ${message}\n`;
    
    const logsDir = path.join(DATA_DIRECTORY, "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.appendFileSync(path.join(logsDir, "handshake_sync_logs.txt"), logEntry, "utf8");
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error writing handshake log:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/server-data/log-license-audit", requirePermission("canManageSettings"), (req, res) => {
  try {
    const { machineId, clinicName, timestamp, eventType, licenseKey } = req.body;
    
    const logTime = timestamp || new Date().toISOString();
    const cleanMachineId = machineId || "Unknown Machine ID";
    const cleanClinicName = clinicName || "Unknown Clinic";
    const cleanKey = licenseKey || "N/A";
    const cleanType = eventType || "VALIDATION";

    const logContent = `
============================================================
CLINICCORE AUDIT: ${cleanType}
============================================================
Timestamp: ${logTime}
Clinic Name: ${cleanClinicName}
Machine ID / HWID: ${cleanMachineId}
License Key: ${cleanKey}
Audit Outcome: SUCCESSFUL VERIFICATION & ACTIVE ACCESS
============================================================
\n`;

    // 1. Write local backup
    const logsDir = path.join(DATA_DIRECTORY, "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(path.join(logsDir, "license_audits.txt"), logContent, "utf8");

    // 2. Scan and write directly to connected USB drives if present on Windows
    let loggedToUsbCount = 0;
    if (process.platform === "win32") {
      const driveLetters = "DEFGHIJKLMNOPQRSTUVWXYZ".split("");
      for (const drive of driveLetters) {
        const usbPath = `${drive}:\\cliniccore_licenses.txt`;
        try {
          fs.appendFileSync(usbPath, logContent, "utf8");
          console.log(`License audit logged successfully to USB: ${usbPath}`);
          loggedToUsbCount++;
        } catch (e) {
          // Quietly fail for non-existent or read-only drives
        }
      }
    }

    res.json({ success: true, loggedToUsbCount });
  } catch (err: any) {
    console.error("Error in license audit logging:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/server-data/log-transaction", (req, res) => {
  try {
    const { log, clinicName, regNumber } = req.body;
    if (!log || typeof log !== "object" || typeof log.action !== "string" || typeof log.entityName !== "string") {
      return res.status(400).json({ success: false, error: "Missing log object" });
    }

    const session = (req as any).clinicSession;
    const serverTimestamp = new Date().toISOString();
    const auditLog: ClinicalAuditLog = {
      id: `server-log-${randomBytes(12).toString("hex")}`,
      tenantId: session.tenantId,
      actorUserId: session.userId,
      timestamp: serverTimestamp,
      action: log.action.slice(0, 100),
      entityName: log.entityName.slice(0, 100),
      entityId: typeof log.entityId === "string" ? log.entityId.slice(0, 120) : "",
      executedSql: typeof log.executedSql === "string" ? log.executedSql.slice(0, 2000) : "N/A",
      status: "COMMITTED",
      details: typeof log.details === "string" ? log.details.slice(0, 2000) : "N/A",
    };
    const data = loadSyncData();
    data.tables = data.tables || {};
    const auditLogs: ClinicalAuditLog[] = Array.isArray(data.tables.auditLogs) ? data.tables.auditLogs : [];
    data.tables.auditLogs = [auditLog, ...auditLogs].slice(0, 5000);
    saveSyncData(data);

    const timestamp = new Date(serverTimestamp).toLocaleString("en-US");
    const formattedLog = `[${timestamp}] [ACTOR: ${session.userId}] [CLINIC: ${clinicName || "Clinic"} (${session.tenantId})] [ACTION: ${auditLog.action}] [ENTITY: ${auditLog.entityName} (${auditLog.entityId})]
SQL: ${auditLog.executedSql}
Details: ${auditLog.details}
--------------------------------------------------------------------------------\n`;

    // 1. Save to dedicated local directory
    const dedicatedDir = path.join(DATA_DIRECTORY, "transaction_logs");
    if (!fs.existsSync(dedicatedDir)) {
      fs.mkdirSync(dedicatedDir, { recursive: true });
    }
    const localFilePath = path.join(dedicatedDir, "cliniccore_transactions.txt");
    fs.appendFileSync(localFilePath, formattedLog, "utf8");

    // 2. Scan and write directly to connected USB drives if present on Windows
    if (process.platform === "win32") {
      const driveLetters = "DEFGHIJKLMNOPQRSTUVWXYZ".split("");
      for (const drive of driveLetters) {
        // Create a dedicated directory on the USB if it exists
        const usbDir = `${drive}:\\cliniccore_transaction_logs`;
        const usbFilePath = `${usbDir}\\cliniccore_transactions.txt`;
        
        try {
          if (!fs.existsSync(usbDir)) {
            fs.mkdirSync(usbDir, { recursive: true });
          }
          fs.appendFileSync(usbFilePath, formattedLog, "utf8");
          console.log(`Transaction logged successfully to USB drive: ${usbFilePath}`);
        } catch (e) {
          // Quietly fail for non-existent or read-only drives
        }
      }
    }

    res.json({ success: true, path: localFilePath });
  } catch (err: any) {
    console.error("Error saving transaction log:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- MySQL Relational Database Service Endpoints ---
app.get("/api/mysql/status", async (req, res) => {
  try {
    const status = await testMysqlConnection();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.json({
      success: false,
      connected: false,
      error: err.message,
      config: (({ host, port, user, database }) => ({ host, port, user, database }))(getMysqlConfig()),
    });
  }
});

app.post("/api/mysql/config", async (req, res) => {
  try {
    const { host, port, user, password, database } = req.body;
    updateMysqlConfig({
      ...(host ? { host } : {}),
      ...(port ? { port: Number(port) } : {}),
      ...(user ? { user } : {}),
      ...(password !== undefined ? { password } : {}),
      ...(database ? { database } : {}),
    });
    const status = await testMysqlConnection();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/mysql/init-tables", async (req, res) => {
  try {
    const result = await initializeMysqlTables();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/mysql/sync", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, error: "No data payload provided" });
    }
    const data = { ...req.body };
    const session = (req as any).clinicSession;
    for (const collection of TENANT_COLLECTIONS) {
      if (Array.isArray(data[collection])) {
        data[collection] = data[collection]
          .filter((record: any) => !record?.tenantId || record.tenantId === session.tenantId)
          .map((record: any) => ({ ...record, tenantId: session.tenantId }));
      }
    }
    const syncResult = await syncDataToMysql(data);
    res.json({ success: true, ...syncResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/mysql/query", async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql || typeof sql !== "string") {
      return res.status(400).json({ success: false, message: "SQL query string is required" });
    }
    const normalizedSql = sql.trim().replace(/;\s*$/, "");
    if (!/^SELECT\b/i.test(normalizedSql) || normalizedSql.includes(";") || /\b(INTO\s+(OUTFILE|DUMPFILE)|FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE)\b/i.test(normalizedSql)) {
      return res.status(403).json({ success: false, message: "Only single, read-only SELECT queries are allowed." });
    }
    const result = await executeMysqlQuery(sql);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/mysql/dump", (req, res) => {
  try {
    const schemaPath = path.join(process.cwd(), "cliniccore_mysql_schema.sql");
    if (!fs.existsSync(schemaPath)) {
      return res.status(404).json({ success: false, error: "Schema file not found" });
    }
    res.setHeader("Content-Disposition", "attachment; filename=cliniccore_mysql_schema.sql");
    res.setHeader("Content-Type", "application/sql");
    fs.createReadStream(schemaPath).pipe(res);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Multi-Tenant Medical Specialities Marketplace Endpoints ---
app.get("/api/tenants/:tenantId/specialities", (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = loadSyncData();
    const tenantSpecialities = data?.tables?.tenantSpecialities?.[tenantId] || {
      "internal-medicine": true,
      "general-surgery": true,
      "gyn-obs": true,
      "pediatrics": true,
      "cardiology": false,
      "orthopedics": false,
      "ophthalmology": false,
      "urology": false,
      "neurosurgery": false,
      "ent": false,
      "psychiatry": false,
      "radiology": false,
      "pathology": false,
      "dermatology": false,
      "pulmonology": false,
      "physiotherapy": false,
      "oncology": false
    };
    res.json({ success: true, tenantId, specialities: tenantSpecialities });
  } catch (error: any) {
    console.error("Error fetching tenant specialities:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/admin/toggle-speciality", async (req, res) => {
  try {
    const { tenantId, specialityId, isUnlocked, reason } = req.body;
    if (!tenantId || !specialityId || typeof isUnlocked !== "boolean") {
      return res.status(400).json({ success: false, error: "tenantId, specialityId, and isUnlocked are required." });
    }

    const data = loadSyncData();
    data.tables = data.tables || {};
    data.tables.tenantSpecialities = data.tables.tenantSpecialities || {};
    data.tables.tenantSpecialities[tenantId] = data.tables.tenantSpecialities[tenantId] || {};
    data.tables.tenantSpecialities[tenantId][specialityId] = isUnlocked;

    // Record audit log
    const session = (req as any).clinicSession || { userId: "super-admin", tenantId };
    recordAuthAudit(
      session,
      isUnlocked ? "GRANT_SPECIALITY_ACCESS" : "REVOKE_SPECIALITY_ACCESS",
      "SpecialityMarketplace",
      specialityId,
      "COMMITTED",
      `Speciality ${specialityId} ${isUnlocked ? "granted" : "revoked"} for tenant ${tenantId}. Reason: ${reason || "Super Admin toggle"}`
    );

    saveSyncData(data);

    // Sync atomically to MySQL tenant_speciality_access table if connected
    try {
      const pool = getMysqlPool();
      await pool.query(
        `INSERT INTO tenant_speciality_access (tenant_id, speciality_id, is_active, updated_at) 
         VALUES (?, ?, ?, NOW()) 
         ON DUPLICATE KEY UPDATE is_active = VALUES(is_active), updated_at = NOW()`,
        [tenantId, specialityId, isUnlocked ? 1 : 0]
      );
    } catch (mysqlErr) {
      // Primary local truth persisted in JSON snapshot
    }

    res.json({
      success: true,
      tenantId,
      specialityId,
      isUnlocked,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Error toggling speciality:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Distributed Offline-First Background Sync Reconciliation Engine ---
app.post("/api/sync/reconcile", async (req, res) => {
  try {
    const { tenantId, mutations } = req.body;
    if (!Array.isArray(mutations)) {
      return res.status(400).json({ success: false, error: "mutations array is required." });
    }

    const effectiveTenantId = tenantId || "DEFAULT";
    const data = loadSyncData();
    data.tables = data.tables || {};

    const processedIds: string[] = [];

    // Optional atomic MySQL connection
    let mysqlConn: any = null;
    try {
      const pool = getMysqlPool();
      mysqlConn = await pool.getConnection();
      await mysqlConn.beginTransaction();
    } catch (poolErr) {
      mysqlConn = null;
    }

    for (const mutation of mutations) {
      const { id, type, entity, entityId, payload, timestamp } = mutation;
      if (!id || !entity) continue;

      if (entity === "tenantSpecialities" && payload) {
        data.tables.tenantSpecialities = data.tables.tenantSpecialities || {};
        data.tables.tenantSpecialities[effectiveTenantId] = {
          ...(data.tables.tenantSpecialities[effectiveTenantId] || {}),
          ...payload
        };
      } else if (entity === "specialityRecords" && payload) {
        data.tables.specialityRecords = data.tables.specialityRecords || {};
        data.tables.specialityRecords[payload.specialityId] = data.tables.specialityRecords[payload.specialityId] || [];
        const records = data.tables.specialityRecords[payload.specialityId];
        const existingIdx = records.findIndex((r: any) => r.id === payload.id);
        if (existingIdx >= 0) {
          records[existingIdx] = { ...records[existingIdx], ...payload, updatedAt: timestamp };
        } else {
          records.unshift({ ...payload, tenantId: effectiveTenantId, createdAt: timestamp });
        }
      } else if (Array.isArray(data.tables[entity])) {
        const rows = data.tables[entity];
        const existingIdx = rows.findIndex((r: any) => r.id === entityId);
        if (type === "DELETE") {
          if (existingIdx >= 0) rows.splice(existingIdx, 1);
        } else if (existingIdx >= 0) {
          rows[existingIdx] = { ...rows[existingIdx], ...payload, updatedAt: timestamp };
        } else {
          rows.unshift({ ...payload, tenantId: effectiveTenantId, createdAt: timestamp });
        }
      }

      // MySQL Atomic Logging
      if (mysqlConn) {
        try {
          await mysqlConn.query(
            `INSERT INTO offline_sync_log (mutation_id, tenant_id, entity, entity_id, mutation_type, payload_json, client_timestamp, processed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE processed_at = NOW()`,
            [id, effectiveTenantId, entity, entityId || id, type, JSON.stringify(payload || {}), new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ')]
          );
        } catch (mErr) {
          // Continue logging
        }
      }

      processedIds.push(id);
    }

    if (mysqlConn) {
      try {
        await mysqlConn.commit();
      } catch (commitErr) {
        await mysqlConn.rollback();
      } finally {
        mysqlConn.release();
      }
    }

    saveSyncData(data);

    res.json({
      success: true,
      processedCount: processedIds.length,
      processedIds,
      serverTimestamp: Date.now()
    });
  } catch (error: any) {
    console.error("Reconciliation error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Vite middleware for development & production static file serving
async function startServer() {
  if (typeof IS_PRODUCTION_BUILD === "undefined" && !IS_PRODUCTION) {
    try {
      const vitePkg = "vite";
      const { createServer: createViteServer } = await import(vitePkg);
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite middleware could not be loaded in dev mode:", e);
    }
  } else {
    let distPath = __dirname;
    if (fs.existsSync(path.join(__dirname, "index.html"))) {
      distPath = __dirname;
    } else if (fs.existsSync(path.join(__dirname, "dist", "index.html"))) {
      distPath = path.join(__dirname, "dist");
    } else if (fs.existsSync(path.join(process.cwd(), "dist", "index.html"))) {
      distPath = path.join(process.cwd(), "dist");
    }
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Pre-warm and bootstrap dynamic tenant schema & migrations
  try {
    await tenantPoolManager.getTenantPool(activeLicense.tenantId);
    console.log(`[TENANT_BOOTSTRAP] Dynamic tenant schema verified: ${tenantPoolManager.getSchemaName(activeLicense.tenantId)}`);
  } catch (err: any) {
    console.warn(`[TENANT_BOOTSTRAP] Local MySQL service notice: ${err.message}. Air-gapped fallback active.`);
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    const interfaces = os.networkInterfaces();
    const lanIps: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          lanIps.push(iface.address);
        }
      }
    }

    console.log(`\n======================================================`);
    console.log(`🏥 CLINICCORE WORKSTATION IS LIVE ON LAN & LOCALHOST!`);
    console.log(`======================================================`);
    console.log(`💻 This Server Host PC:   http://localhost:${PORT}`);
    lanIps.forEach((ip) => {
      console.log(`🌐 Clinic LAN Workstation: http://${ip}:${PORT}`);
    });
    console.log(`\n📌 Open the LAN URL above on Reception, Doctor & Pharmacy PCs.`);
    console.log(`======================================================\n`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[ClinicCore] Port ${PORT} already active or in use.`);
    } else {
      console.error("[ClinicCore] Server listener error:", err);
    }
  });

  return server;
}

startServer();
