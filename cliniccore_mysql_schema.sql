-- ============================================================
-- ClinicCore MySQL Database Schema & Initial Data
-- Engine: MySQL 8.0+ / MariaDB 10.4+ (Compatible with XAMPP, WAMP, RDS)
-- Character Set: utf8mb4 / utf8mb4_unicode_ci
-- ============================================================

CREATE DATABASE IF NOT EXISTS `cliniccore_db` 
  DEFAULT CHARACTER SET utf8mb4 
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `cliniccore_db`;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Clinics / Clinic Profile
CREATE TABLE IF NOT EXISTS `clinic_profile` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `clinicName` VARCHAR(255) NOT NULL,
  `tagline` VARCHAR(255) DEFAULT '',
  `doctorName` VARCHAR(255) NOT NULL,
  `specialization` VARCHAR(255) DEFAULT '',
  `regNumber` VARCHAR(100) NOT NULL UNIQUE,
  `address` TEXT DEFAULT NULL,
  `city` VARCHAR(100) DEFAULT 'Lahore',
  `phone` VARCHAR(50) DEFAULT '',
  `email` VARCHAR(150) DEFAULT '',
  `website` VARCHAR(200) DEFAULT '',
  `taxRegistration` VARCHAR(100) DEFAULT '',
  `currency` VARCHAR(20) DEFAULT 'PKR',
  `themeMode` VARCHAR(20) DEFAULT 'light',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. App Users & Role-Based Access Control
CREATE TABLE IF NOT EXISTS `app_users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `fullName` VARCHAR(255) NOT NULL,
  `role` ENUM('SuperAdmin', 'ClinicAdmin', 'Doctor', 'Receptionist', 'Pharmacist', 'LabTechnician') NOT NULL DEFAULT 'Doctor',
  `email` VARCHAR(150) DEFAULT '',
  `phone` VARCHAR(50) DEFAULT '',
  `pinHash` VARCHAR(255) NOT NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `avatarColor` VARCHAR(50) DEFAULT 'bg-teal-600',
  `department` VARCHAR(100) DEFAULT 'General Medicine',
  `permissions` JSON DEFAULT NULL,
  `createdAt` DATETIME NOT NULL,
  `lastLoginAt` DATETIME DEFAULT NULL,
  INDEX `idx_users_tenant` (`tenantId`),
  INDEX `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Patients Registry
CREATE TABLE IF NOT EXISTS `patients` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `mrn` VARCHAR(100) NOT NULL UNIQUE,
  `fullName` VARCHAR(255) NOT NULL,
  `dateOfBirth` DATE DEFAULT NULL,
  `age` INT NOT NULL DEFAULT 0,
  `gender` ENUM('Male', 'Female', 'Other') NOT NULL DEFAULT 'Male',
  `phone` VARCHAR(50) NOT NULL,
  `email` VARCHAR(150) DEFAULT '',
  `relationship` VARCHAR(100) DEFAULT '',
  `bloodGroup` VARCHAR(10) DEFAULT 'O+',
  `address` TEXT DEFAULT NULL,
  `emergencyContact` VARCHAR(100) DEFAULT '',
  `knownAllergies` JSON DEFAULT NULL,
  `chronicConditions` JSON DEFAULT NULL,
  `totalVisits` INT NOT NULL DEFAULT 1,
  `lastVisitDate` DATETIME DEFAULT NULL,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME NOT NULL,
  INDEX `idx_patients_tenant` (`tenantId`),
  INDEX `idx_patients_mrn` (`mrn`),
  INDEX `idx_patients_phone` (`phone`),
  INDEX `idx_patients_name` (`fullName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Vital Signs
CREATE TABLE IF NOT EXISTS `vital_signs` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `patientId` VARCHAR(64) NOT NULL,
  `recordedAt` DATETIME NOT NULL,
  `systolicBp` INT NOT NULL DEFAULT 120,
  `diastolicBp` INT NOT NULL DEFAULT 80,
  `pulseRate` INT NOT NULL DEFAULT 72,
  `temperature` DECIMAL(4,1) NOT NULL DEFAULT 37.0,
  `respiratoryRate` INT NOT NULL DEFAULT 18,
  `oxygenSaturation` INT NOT NULL DEFAULT 98,
  `weightKg` DECIMAL(5,2) NOT NULL DEFAULT 70.0,
  `heightCm` DECIMAL(5,2) NOT NULL DEFAULT 170.0,
  `bmi` DECIMAL(4,1) NOT NULL DEFAULT 24.2,
  `notes` TEXT DEFAULT NULL,
  INDEX `idx_vitals_patient` (`patientId`),
  INDEX `idx_vitals_recordedAt` (`recordedAt`),
  CONSTRAINT `fk_vitals_patient` FOREIGN KEY (`patientId`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Appointments
CREATE TABLE IF NOT EXISTS `appointments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `tokenNumber` VARCHAR(50) DEFAULT '',
  `patientId` VARCHAR(64) NOT NULL,
  `patientName` VARCHAR(255) NOT NULL,
  `patientPhone` VARCHAR(50) NOT NULL,
  `patientAge` INT DEFAULT NULL,
  `patientGender` VARCHAR(20) DEFAULT 'Male',
  `patientMrn` VARCHAR(100) DEFAULT '',
  `appointmentDateTime` DATETIME NOT NULL,
  `doctorName` VARCHAR(255) NOT NULL,
  `reasonForVisit` TEXT DEFAULT NULL,
  `status` ENUM('Scheduled', 'Waiting', 'Vitals Done', 'In Consultation', 'Prescribed', 'Lab Pending', 'Pharmacy Pending', 'Billing Pending', 'Completed', 'Cancelled', 'No Show') NOT NULL DEFAULT 'Scheduled',
  `fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT DEFAULT NULL,
  `triageVitals` JSON DEFAULT NULL,
  `referredToPharmacy` TINYINT(1) DEFAULT 0,
  `referredToLab` TINYINT(1) DEFAULT 0,
  `labTestNames` JSON DEFAULT NULL,
  `prescriptionId` VARCHAR(64) DEFAULT NULL,
  `invoiceId` VARCHAR(64) DEFAULT NULL,
  `totalAmountDue` DECIMAL(10,2) DEFAULT 0.00,
  `isBilled` TINYINT(1) DEFAULT 0,
  INDEX `idx_appts_patient` (`patientId`),
  INDEX `idx_appts_date` (`appointmentDateTime`),
  INDEX `idx_appts_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Prescriptions
CREATE TABLE IF NOT EXISTS `prescriptions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `patientId` VARCHAR(64) NOT NULL,
  `patientName` VARCHAR(255) NOT NULL,
  `doctorName` VARCHAR(255) NOT NULL,
  `doctorLicense` VARCHAR(100) DEFAULT '',
  `consultationDate` DATETIME NOT NULL,
  `chiefComplaints` TEXT DEFAULT NULL,
  `clinicalFindings` TEXT DEFAULT NULL,
  `icd10Diagnosis` JSON DEFAULT NULL,
  `vitalsSummary` JSON DEFAULT NULL,
  `doctorAdvice` TEXT DEFAULT NULL,
  `followUpDate` DATE DEFAULT NULL,
  `invoiceId` VARCHAR(64) DEFAULT NULL,
  `tokenNumber` VARCHAR(50) DEFAULT '',
  `referredToPharmacy` TINYINT(1) DEFAULT 0,
  `referredToLab` TINYINT(1) DEFAULT 0,
  `labTestsOrdered` JSON DEFAULT NULL,
  `estimatedPharmacyCost` DECIMAL(10,2) DEFAULT 0.00,
  `estimatedLabCost` DECIMAL(10,2) DEFAULT 0.00,
  `isDispensed` TINYINT(1) DEFAULT 0,
  `isBilled` TINYINT(1) DEFAULT 0,
  `createdAt` DATETIME NOT NULL,
  INDEX `idx_prescriptions_patient` (`patientId`),
  INDEX `idx_prescriptions_date` (`consultationDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Prescription Items
CREATE TABLE IF NOT EXISTS `prescription_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `prescriptionId` VARCHAR(64) NOT NULL,
  `drugName` VARCHAR(255) NOT NULL,
  `dosageForm` VARCHAR(50) NOT NULL DEFAULT 'Tablet',
  `strength` VARCHAR(50) DEFAULT '',
  `frequency` VARCHAR(100) DEFAULT '',
  `duration` VARCHAR(100) DEFAULT '',
  `quantity` INT NOT NULL DEFAULT 1,
  `instructions` TEXT DEFAULT NULL,
  INDEX `idx_rx_items_rx` (`prescriptionId`),
  CONSTRAINT `fk_rx_items_parent` FOREIGN KEY (`prescriptionId`) REFERENCES `prescriptions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Invoices
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `invoiceNumber` VARCHAR(100) NOT NULL UNIQUE,
  `patientId` VARCHAR(64) NOT NULL,
  `patientName` VARCHAR(255) NOT NULL,
  `prescriptionId` VARCHAR(64) DEFAULT NULL,
  `tokenNumber` VARCHAR(50) DEFAULT '',
  `issueDate` DATETIME NOT NULL,
  `dueDate` DATETIME NOT NULL,
  `subTotal` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `taxAmount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discountAmount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `grandTotal` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `amountPaid` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `balanceDue` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('Paid', 'Partially Paid', 'Unpaid', 'Cancelled') NOT NULL DEFAULT 'Unpaid',
  `paymentMethod` VARCHAR(100) NOT NULL DEFAULT 'Cash',
  `notes` TEXT DEFAULT NULL,
  `createdAt` DATETIME NOT NULL,
  INDEX `idx_invoices_patient` (`patientId`),
  INDEX `idx_invoices_number` (`invoiceNumber`),
  INDEX `idx_invoices_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Invoice Line Items
CREATE TABLE IF NOT EXISTS `invoice_line_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `invoiceId` VARCHAR(64) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `itemType` VARCHAR(50) NOT NULL DEFAULT 'Consultation',
  `unitPrice` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `quantity` INT NOT NULL DEFAULT 1,
  `totalPrice` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  INDEX `idx_invoice_items_inv` (`invoiceId`),
  CONSTRAINT `fk_invoice_items_parent` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Pharmacy Medicines Inventory
CREATE TABLE IF NOT EXISTS `pharmacy_medicines` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `brandName` VARCHAR(255) NOT NULL,
  `genericName` VARCHAR(255) NOT NULL,
  `dosageForm` VARCHAR(50) NOT NULL DEFAULT 'Tablet',
  `strength` VARCHAR(50) NOT NULL DEFAULT '500mg',
  `category` VARCHAR(100) NOT NULL DEFAULT 'General',
  `batchNumber` VARCHAR(100) NOT NULL,
  `expiryDate` DATE NOT NULL,
  `stockQuantity` INT NOT NULL DEFAULT 0,
  `reorderLevel` INT NOT NULL DEFAULT 20,
  `purchasePrice` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `salePrice` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `manufacturer` VARCHAR(255) DEFAULT '',
  `locationRack` VARCHAR(100) DEFAULT '',
  `isControlled` TINYINT(1) DEFAULT 0,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME NOT NULL,
  INDEX `idx_pharmacy_brand` (`brandName`),
  INDEX `idx_pharmacy_generic` (`genericName`),
  INDEX `idx_pharmacy_expiry` (`expiryDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Pharmacy Dispense Records
CREATE TABLE IF NOT EXISTS `pharmacy_dispenses` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `dispenseNumber` VARCHAR(100) NOT NULL UNIQUE,
  `patientId` VARCHAR(64) DEFAULT NULL,
  `patientName` VARCHAR(255) NOT NULL,
  `patientPhone` VARCHAR(50) DEFAULT '',
  `patientMrn` VARCHAR(100) DEFAULT '',
  `doctorName` VARCHAR(255) DEFAULT '',
  `dispensedBy` VARCHAR(255) NOT NULL,
  `dispensedAt` DATETIME NOT NULL,
  `items` JSON NOT NULL,
  `subTotal` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discountAmount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `grandTotal` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `amountPaid` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `changeDue` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `paymentMethod` VARCHAR(100) NOT NULL DEFAULT 'Cash',
  `status` VARCHAR(50) NOT NULL DEFAULT 'Completed',
  `notes` TEXT DEFAULT NULL,
  INDEX `idx_dispenses_patient` (`patientId`),
  INDEX `idx_dispenses_date` (`dispensedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Lab Diagnostic Orders
CREATE TABLE IF NOT EXISTS `lab_test_orders` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `orderNumber` VARCHAR(100) NOT NULL UNIQUE,
  `patientId` VARCHAR(64) NOT NULL,
  `patientName` VARCHAR(255) NOT NULL,
  `patientPhone` VARCHAR(50) DEFAULT '',
  `doctorName` VARCHAR(255) NOT NULL,
  `prescriptionId` VARCHAR(64) DEFAULT NULL,
  `testName` VARCHAR(255) NOT NULL,
  `testCategory` VARCHAR(100) DEFAULT 'Hematology',
  `orderedAt` DATETIME NOT NULL,
  `sampleCollectedAt` DATETIME DEFAULT NULL,
  `resultReportedAt` DATETIME DEFAULT NULL,
  `status` ENUM('Ordered', 'Sample Collected', 'Processing', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Ordered',
  `resultSummary` TEXT DEFAULT NULL,
  `results` JSON DEFAULT NULL,
  `referenceRange` VARCHAR(255) DEFAULT '',
  `isAbnormal` TINYINT(1) DEFAULT 0,
  `paid` TINYINT(1) DEFAULT 0,
  `completedAt` DATETIME DEFAULT NULL,
  `cost` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `performedBy` VARCHAR(255) DEFAULT '',
  INDEX `idx_lab_patient` (`patientId`),
  INDEX `idx_lab_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Clinic Operating Expenses
CREATE TABLE IF NOT EXISTS `clinic_expenses` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `title` VARCHAR(255) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `expenseDate` DATE NOT NULL,
  `paymentMethod` VARCHAR(100) NOT NULL DEFAULT 'Cash',
  `recipient` VARCHAR(255) DEFAULT '',
  `recordedBy` VARCHAR(255) NOT NULL,
  `receiptNumber` VARCHAR(100) DEFAULT '',
  `notes` TEXT DEFAULT NULL,
  `createdAt` DATETIME NOT NULL,
  INDEX `idx_expense_date` (`expenseDate`),
  INDEX `idx_expense_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Clinical Audit Logs
CREATE TABLE IF NOT EXISTS `clinical_audit_logs` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenantId` VARCHAR(64) NOT NULL DEFAULT 'clinic-default',
  `timestamp` DATETIME NOT NULL,
  `actorUserId` VARCHAR(64) DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entityName` VARCHAR(100) NOT NULL,
  `entityId` VARCHAR(100) NOT NULL,
  `executedSql` TEXT DEFAULT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'COMMITTED',
  `details` TEXT DEFAULT NULL,
  INDEX `idx_audit_timestamp` (`timestamp`),
  INDEX `idx_audit_entity` (`entityName`, `entityId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Software Licenses
CREATE TABLE IF NOT EXISTS `licenses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `clinicName` VARCHAR(255) NOT NULL,
  `doctorName` VARCHAR(255) NOT NULL,
  `city` VARCHAR(100) DEFAULT 'Lahore',
  `hardwareId` VARCHAR(255) NOT NULL,
  `licenseKey` VARCHAR(255) NOT NULL UNIQUE,
  `licenseTier` VARCHAR(50) NOT NULL DEFAULT 'Enterprise',
  `issuedAt` DATETIME NOT NULL,
  `expiresAt` VARCHAR(100) NOT NULL DEFAULT 'NEVER',
  `durationDays` INT NOT NULL DEFAULT 9999,
  `isActivated` TINYINT(1) NOT NULL DEFAULT 1,
  `features` JSON DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Tenant Speciality Access Matrix
CREATE TABLE IF NOT EXISTS `tenant_speciality_access` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `speciality_id` VARCHAR(64) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `unlocked_by` VARCHAR(64) DEFAULT 'SuperAdmin',
  `unlocked_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_tenant_speciality` (`tenant_id`, `speciality_id`),
  INDEX `idx_tenant_access` (`tenant_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. ENT Clinical Procedures
CREATE TABLE IF NOT EXISTS `clinical_ent_procedures` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `mrn` VARCHAR(100) NOT NULL,
  `audiometry_data` JSON DEFAULT NULL,
  `tympanometry_type_right` VARCHAR(20) DEFAULT 'Type A',
  `tympanometry_type_left` VARCHAR(20) DEFAULT 'Type A',
  `otoscopy_findings` TEXT DEFAULT NULL,
  `procedure_name` VARCHAR(150) DEFAULT NULL,
  `pre_op_checklist` JSON DEFAULT NULL,
  `post_op_notes` TEXT DEFAULT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `performed_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ent_tenant_patient` (`tenant_id`, `patient_id`),
  INDEX `idx_ent_mrn` (`mrn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. Cardiology Records & Hemodynamics
CREATE TABLE IF NOT EXISTS `clinical_cardiology_records` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `mrn` VARCHAR(100) NOT NULL,
  `echo_ejection_fraction` DECIMAL(5,2) DEFAULT NULL,
  `echo_lvedd` DECIMAL(5,2) DEFAULT NULL,
  `echo_valve_assessment` JSON DEFAULT NULL,
  `ecg_attachment_url` TEXT DEFAULT NULL,
  `angiography_vessel_findings` JSON DEFAULT NULL,
  `lipid_profile` JSON DEFAULT NULL,
  `bp_trend_history` JSON DEFAULT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `recorded_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_cardio_tenant_patient` (`tenant_id`, `patient_id`),
  INDEX `idx_cardio_mrn` (`mrn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. Gynecology & Obstetrics Records
CREATE TABLE IF NOT EXISTS `clinical_gynobs_records` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `mrn` VARCHAR(100) NOT NULL,
  `record_type` ENUM('ANC', 'PNC', 'Ultrasound', 'Delivery', 'Menstrual') NOT NULL,
  `lmp_date` DATE DEFAULT NULL,
  `edd_calculated` DATE DEFAULT NULL,
  `gestational_age_weeks` DECIMAL(4,1) DEFAULT NULL,
  `gravida_para_status` VARCHAR(50) DEFAULT 'G1 P0+0',
  `fetal_heart_rate` INT DEFAULT NULL,
  `fundal_height_cm` DECIMAL(4,1) DEFAULT NULL,
  `ultrasound_findings` TEXT DEFAULT NULL,
  `delivery_summary` JSON DEFAULT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `recorded_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_gynobs_tenant_patient` (`tenant_id`, `patient_id`),
  INDEX `idx_gynobs_edd` (`edd_calculated`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. General Surgery & Orthopedics Procedures
CREATE TABLE IF NOT EXISTS `clinical_surgical_records` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `mrn` VARCHAR(100) NOT NULL,
  `sub_speciality` ENUM('General Surgery', 'Orthopedics', 'Neurosurgery', 'Urology') NOT NULL,
  `procedure_title` VARCHAR(255) NOT NULL,
  `who_surgical_safety_checklist` JSON DEFAULT NULL,
  `fracture_classification` VARCHAR(100) DEFAULT NULL,
  `implant_tracking` JSON DEFAULT NULL,
  `ot_surgeon` VARCHAR(255) NOT NULL,
  `ot_anesthetist` VARCHAR(255) DEFAULT '',
  `post_op_rehab_milestones` TEXT DEFAULT NULL,
  `operated_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_surgery_tenant_patient` (`tenant_id`, `patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. Pediatrics & Neonatal Records
CREATE TABLE IF NOT EXISTS `clinical_pediatric_records` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `mrn` VARCHAR(100) NOT NULL,
  `birth_weight_kg` DECIMAL(5,2) DEFAULT NULL,
  `current_percentile_weight` DECIMAL(5,2) DEFAULT NULL,
  `current_percentile_height` DECIMAL(5,2) DEFAULT NULL,
  `head_circumference_cm` DECIMAL(5,2) DEFAULT NULL,
  `vaccination_schedule` JSON DEFAULT NULL,
  `developmental_milestones` JSON DEFAULT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `recorded_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_peds_tenant_patient` (`tenant_id`, `patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. Speciality Documents & Imaging
CREATE TABLE IF NOT EXISTS `clinical_speciality_documents` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `speciality_id` VARCHAR(64) NOT NULL,
  `document_type` ENUM('DICOM', 'X-Ray', 'Ultrasound_Image', 'Histopathology', 'Lab_Report', 'Clinical_Photo') NOT NULL,
  `file_url` TEXT NOT NULL,
  `file_size_bytes` BIGINT DEFAULT 0,
  `modality` VARCHAR(50) DEFAULT 'DX',
  `metadata` JSON DEFAULT NULL,
  `uploaded_by` VARCHAR(64) NOT NULL,
  `uploaded_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_doc_tenant_patient` (`tenant_id`, `patient_id`),
  INDEX `idx_doc_speciality` (`speciality_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. Distributed Offline Sync Mutation Log
CREATE TABLE IF NOT EXISTS `offline_sync_log` (
  `mutation_id` VARCHAR(100) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `entity` VARCHAR(64) NOT NULL,
  `entity_id` VARCHAR(120) NOT NULL,
  `mutation_type` ENUM('CREATE', 'UPDATE', 'DELETE', 'TOGGLE_SPECIALITY') NOT NULL,
  `payload_json` LONGTEXT NOT NULL,
  `client_timestamp` DATETIME NOT NULL,
  `processed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sync_tenant` (`tenant_id`, `processed_at`),
  INDEX `idx_sync_entity` (`entity`, `entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

