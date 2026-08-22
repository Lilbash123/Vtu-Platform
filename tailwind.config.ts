import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Light fintech theme — replaces the old dark ledger palette.
        brand: {
          50: '#F0F0FF',
          100: '#E4E3FF',
          400: '#8B84F7',
          500: '#6C5CE7',
          600: '#5B4FE0',
          700: '#4A3FC7',
        },
        ink: '#0F1720',           // kept for admin legacy text where needed
        surface: '#F6F7FB',       // page background
        card: '#FFFFFF',
        line: '#E7E8F0',
        'text-primary': '#1A1A2E',
        'text-muted': '#6B7280',
        success: '#16A34A',
        'success-bg': '#DCFCE7',
        danger: '#DC2626',
        'danger-bg': '#FEE2E2',
        pending: '#2563EB',
        'pending-bg': '#DBEAFE',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)',
        elevated: '0 4px 16px rgba(16, 24, 40, 0.08)',
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
};

export default config;
