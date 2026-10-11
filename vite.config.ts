import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';

// Ingest Client Build Profile for Compile-Time AST Pruning & White-Labeling
function loadBuildProfile() {
  const profilePath = path.resolve(__dirname, 'build-profile.json');
  if (fs.existsSync(profilePath)) {
    try {
      const raw = fs.readFileSync(profilePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[VITE_BUILD] Failed parsing build-profile.json, using defaults:', err);
    }
  }

  return {
    tenant: {
      tenant_id: 'default_clinic',
      clinic_legal_name: 'ClinicCore Medical System',
    },
    branding: {
      clinic_name: 'ClinicCore EMR Workstation',
      tagline: 'High-Performance Ambulatory EHR',
      logo_url: '/assets/cliniccore-logo.png',
      primary_color: '#0f766e',
      secondary_color: '#0d9488',
      accent_color: '#14b8a6',
      currency_symbol: 'Rs. ',
      address: 'Central Medical Complex',
      phone: '+92 42 0000 0000',
    },
    features: {
      ai_voice_scribe: false,
      ai_assistant: false,
      telemedicine: false,
      advanced_analytics: true,
      pharmacy_pos: true,
      inventory_sync: true,
      lab_integration: true,
      billing_insurance: true,
      sms_gateway: false,
    },
  };
}

export default defineConfig(() => {
  const profile = loadBuildProfile();
  const features = profile.features || {};
  const branding = profile.branding || {};

  console.log('----------------------------------------------------');
  console.log('[VITE_COMPILER] Ingesting Build Profile for AST Pruning:');
  console.log(`[VITE_COMPILER] Tenant: ${profile.tenant?.tenant_id} (${branding.clinic_name})`);
  console.log(`[VITE_COMPILER] AI Voice Scribe    : ${Boolean(features.ai_voice_scribe)}`);
  console.log(`[VITE_COMPILER] AI Assistant       : ${Boolean(features.ai_assistant)}`);
  console.log(`[VITE_COMPILER] Telemedicine       : ${Boolean(features.telemedicine)}`);
  console.log(`[VITE_COMPILER] Pharmacy POS       : ${Boolean(features.pharmacy_pos)}`);
  console.log(`[VITE_COMPILER] Lab Integration    : ${Boolean(features.lab_integration)}`);
  console.log(`[VITE_COMPILER] Advanced Analytics : ${Boolean(features.advanced_analytics)}`);
  console.log('----------------------------------------------------');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      __FEATURE_AI_VOICE_SCRIBE__: JSON.stringify(Boolean(features.ai_voice_scribe)),
      __FEATURE_AI_ASSISTANT__: JSON.stringify(Boolean(features.ai_assistant)),
      __FEATURE_TELEMEDICINE__: JSON.stringify(Boolean(features.telemedicine)),
      __FEATURE_ADVANCED_ANALYTICS__: JSON.stringify(Boolean(features.advanced_analytics)),
      __FEATURE_PHARMACY_POS__: JSON.stringify(Boolean(features.pharmacy_pos)),
      __FEATURE_INVENTORY_SYNC__: JSON.stringify(Boolean(features.inventory_sync)),
      __FEATURE_LAB_INTEGRATION__: JSON.stringify(Boolean(features.lab_integration)),
      __FEATURE_BILLING_INSURANCE__: JSON.stringify(Boolean(features.billing_insurance)),
      __CLINIC_BRANDING__: JSON.stringify(branding),
    },
    build: {
      target: 'es2022',
      minify: 'esbuild' as const,
      cssMinify: true,
      sourcemap: false,
      rollupOptions: {
        treeshake: {
          moduleSideEffects: 'no-external',
          propertyReadSideEffects: false,
          tryCatchDeoptimization: false,
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
