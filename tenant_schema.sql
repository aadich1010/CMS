-- Tenant Schema: Unified Database Structure
-- Compatible with MySQL (Hostinger) and SQLite (Local LAN)

-- 1. Tenants Master Table
CREATE TABLE IF NOT EXISTS tenants (
    TenantID VARCHAR(36) PRIMARY KEY,
    ClinicName VARCHAR(255) NOT NULL,
    SubscriptionStatus ENUM('Active', 'Inactive', 'Suspended') DEFAULT 'Active',
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Staff Users Table
CREATE TABLE IF NOT EXISTS users (
    UserID VARCHAR(36) PRIMARY KEY,
    TenantID VARCHAR(36) NOT NULL,
    Username VARCHAR(100) NOT NULL,
    PasswordHash VARCHAR(255) NOT NULL,
    Role ENUM('ClinicAdmin', 'Doctor', 'Receptionist', 'Pharmacist', 'LabTechnician') NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(TenantID)
);

-- 3. Patients Table (Tenant-Isolated)
CREATE TABLE IF NOT EXISTS patients (
    PatientID VARCHAR(36) PRIMARY KEY,
    TenantID VARCHAR(36) NOT NULL,
    FullName VARCHAR(255) NOT NULL,
    DateOfBirth DATE,
    Gender ENUM('Male', 'Female', 'Other'),
    Phone VARCHAR(20),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX(TenantID)
);

-- 4. Appointments Table (Tenant-Isolated)
CREATE TABLE IF NOT EXISTS appointments (
    AppointmentID VARCHAR(36) PRIMARY KEY,
    TenantID VARCHAR(36) NOT NULL,
    PatientID VARCHAR(36) NOT NULL,
    AppointmentDateTime DATETIME NOT NULL,
    Status ENUM('Scheduled', 'CheckedIn', 'Completed', 'Cancelled') DEFAULT 'Scheduled',
    INDEX(TenantID),
    INDEX(PatientID)
);

-- Note: All queries MUST enforce: WHERE TenantID = 'current_tenant_id'
