import type { Config } from 'tailwindcss';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Clinical Ergonomic System (60-30-10 Rule)
        canvas: '#F8FAFC',
        'surface-card': '#FFFFFF',
        'border-default': '#E2E8F0',
        'border-subtle': '#F1F5F9',

        // Primary Clinical Accent (10%)
        clinical: {
          teal: '#0D9488',
          emerald: '#0F766E',
          hover: '#0F766E',
          surface: '#F0FDFA',
          border: '#CCFBF1',
        },

        // Semantic Status Tokens
        status: {
          success: {
            bg: '#ECFDF5',
            text: '#059669',
            border: '#A7F3D0',
          },
          warning: {
            bg: '#FFFBEB',
            text: '#D97706',
            border: '#FDE68A',
          },
          danger: {
            bg: '#FFF1F2',
            text: '#E11D48',
            border: '#FECDD3',
          },
          info: {
            bg: '#F0F9FF',
            text: '#0284C7',
            border: '#BAE6FD',
          },
        },

        // True Standard WCAG 2.2 Neutral Slate Scale
        slate: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },

        // Backward compatibility mappings for older components
        'primary-dark': '#0F172A',
        'brand-vibrant': '#0D9488',
        'brand-light': '#F0FDFA',
        'text-primary': '#0F172A',
        'text-secondary': '#64748B',
        'border-soft': '#E2E8F0',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
        'modal': '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
        'dropdown': '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)',
      },
      borderRadius: {
        'card': '12px',
      },
    },
  },
  plugins: [],
} satisfies Config;
