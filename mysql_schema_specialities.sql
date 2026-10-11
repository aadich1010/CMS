-- ============================================================================
-- CLINICCORE ENTERPRISE SAAS - MULTI-TENANT CLINICAL SPECIALITIES DDL SCHEMA
-- Engine: MySQL 8.0+ (InnoDB)
-- Character Set: utf8mb4 / Collation: utf8mb4_unicode_ci
-- ============================================================================

USE `cliniccore_db`;

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. Tenant Speciality Access Matrix (Dynamic Unlock / Revoke Engine)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2. ENT Procedures & Audiometry Engine
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clinical_ent_procedures` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `mrn` VARCHAR(100) NOT NULL,
  `audiometry_data` JSON DEFAULT NULL COMMENT 'PTA Decibel thresholds for Air/Bone conduction (250Hz - 8kHz)',
  `tympanometry_type_right` VARCHAR(20) DEFAULT 'Type A' COMMENT 'Jerger: Type A, As, Ad, B, C',
  `tympanometry_type_left` VARCHAR(20) DEFAULT 'Type A' COMMENT 'Jerger: Type A, As, Ad, B, C',
  `otoscopy_findings` TEXT DEFAULT NULL,
  `procedure_name` VARCHAR(150) DEFAULT NULL COMMENT 'Tonsillectomy, Septoplasty, FESS, Mastoidectomy',
  `pre_op_checklist` JSON DEFAULT NULL,
  `post_op_notes` TEXT DEFAULT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `performed_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ent_tenant_patient` (`tenant_id`, `patient_id`),
  INDEX `idx_ent_mrn` (`mrn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Cardiology Investigations & Hemodynamics
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clinical_cardiology_records` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `mrn` VARCHAR(100) NOT NULL,
  `echo_ejection_fraction` DECIMAL(5,2) DEFAULT NULL COMMENT 'Ejection Fraction Percentage %',
  `echo_lvedd` DECIMAL(5,2) DEFAULT NULL COMMENT 'Left Ventricular End-Diastolic Dimension (mm)',
  `echo_valve_assessment` JSON DEFAULT NULL COMMENT 'Aortic, Mitral, Tricuspid regurgitation/stenosis',
  `ecg_attachment_url` TEXT DEFAULT NULL,
  `angiography_vessel_findings` JSON DEFAULT NULL COMMENT 'LAD, LCx, RCA occlusion %',
  `lipid_profile` JSON DEFAULT NULL COMMENT 'Total Cholesterol, HDL, LDL, Triglycerides (mg/dL)',
  `bp_trend_history` JSON DEFAULT NULL COMMENT 'Timestamped systolic/diastolic blood pressure curves',
  `doctor_id` VARCHAR(64) NOT NULL,
  `recorded_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_cardio_tenant_patient` (`tenant_id`, `patient_id`),
  INDEX `idx_cardio_mrn` (`mrn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Gynecology & Obstetrics Records
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clinical_gynobs_records` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `mrn` VARCHAR(100) NOT NULL,
  `record_type` ENUM('ANC', 'PNC', 'Ultrasound', 'Delivery', 'Menstrual') NOT NULL,
  `lmp_date` DATE DEFAULT NULL,
  `edd_calculated` DATE DEFAULT NULL COMMENT 'Naegeles Rule: LMP + 1 Year - 3 Months + 7 Days',
  `gestational_age_weeks` DECIMAL(4,1) DEFAULT NULL,
  `gravida_para_status` VARCHAR(50) DEFAULT 'G1 P0+0',
  `fetal_heart_rate` INT DEFAULT NULL COMMENT 'BPM (Normal 120-160)',
  `fundal_height_cm` DECIMAL(4,1) DEFAULT NULL,
  `ultrasound_findings` TEXT DEFAULT NULL,
  `delivery_summary` JSON DEFAULT NULL COMMENT 'Mode of Delivery (SVD, C-Section), APGAR score, Baby weight',
  `doctor_id` VARCHAR(64) NOT NULL,
  `recorded_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_gynobs_tenant_patient` (`tenant_id`, `patient_id`),
  INDEX `idx_gynobs_edd` (`edd_calculated`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. General Surgery & Orthopedics Procedures
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clinical_surgical_records` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `mrn` VARCHAR(100) NOT NULL,
  `sub_speciality` ENUM('General Surgery', 'Orthopedics', 'Neurosurgery', 'Urology') NOT NULL,
  `procedure_title` VARCHAR(255) NOT NULL,
  `who_surgical_safety_checklist` JSON DEFAULT NULL COMMENT 'Sign In, Time Out, Sign Out',
  `fracture_classification` VARCHAR(100) DEFAULT NULL COMMENT 'AO/OTA Classification e.g. 22-A1',
  `implant_tracking` JSON DEFAULT NULL COMMENT 'Manufacturer, Serial Number, Lot, Screws/Plates',
  `ot_surgeon` VARCHAR(255) NOT NULL,
  `ot_anesthetist` VARCHAR(255) DEFAULT '',
  `post_op_rehab_milestones` TEXT DEFAULT NULL,
  `operated_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_surgery_tenant_patient` (`tenant_id`, `patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Pediatrics & Neonatal Health Tracker
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clinical_pediatric_records` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `mrn` VARCHAR(100) NOT NULL,
  `birth_weight_kg` DECIMAL(5,2) DEFAULT NULL,
  `current_percentile_weight` DECIMAL(5,2) DEFAULT NULL,
  `current_percentile_height` DECIMAL(5,2) DEFAULT NULL,
  `head_circumference_cm` DECIMAL(5,2) DEFAULT NULL,
  `vaccination_schedule` JSON DEFAULT NULL COMMENT 'EPI Schedule: BCG, OPV, Pentavalent, PCV, Rota, Measles',
  `developmental_milestones` JSON DEFAULT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `recorded_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_peds_tenant_patient` (`tenant_id`, `patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. High-Volume Diagnostic Imaging & DICOM Vault
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 8. Distributed Offline Sync Mutation Reconciler Log
-- ----------------------------------------------------------------------------
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
