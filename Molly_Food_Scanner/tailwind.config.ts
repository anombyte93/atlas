import type { Config } from "tailwindcss";

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Starlight-inspired palette
        background: {
          primary: 'var(--background-primary)',
          secondary: 'var(--background-secondary)',
          tertiary: 'var(--background-tertiary)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          disabled: 'var(--text-disabled)',
        },
        accent: {
          blue: 'var(--accent-blue)',
          purple: 'var(--accent-purple)',
          green: 'var(--accent-green)',
          yellow: 'var(--accent-yellow)',
          red: 'var(--accent-red)',
        },
        glass: {
          bg: 'var(--glass-bg)',
          border: 'var(--glass-border)',
        },
      },
      fontSize: {
        'xs': 'var(--text-xs)',
        'sm': 'var(--text-sm)',
        'base': 'var(--text-base)',
        'lg': 'var(--text-lg)',
        'xl': 'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
        '3xl': 'var(--text-3xl)',
        '4xl': 'var(--text-4xl)',
      },
      letterSpacing: {
        'tight': 'var(--tracking-tight)',
        'text-tight': 'var(--text-tight)',
      },
      lineHeight: {
        'tight': 'var(--leading-tight)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Segoe UI"',
          '"Roboto"',
          '"Helvetica Neue"',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Monaco',
          '"Courier New"',
          'monospace',
        ],
      },
      spacing: {
        'xs': 'var(--spacing-xs)',
        'sm': 'var(--spacing-sm)',
        'md': 'var(--spacing-md)',
        'lg': 'var(--spacing-lg)',
        'xl': 'var(--spacing-xl)',
        '2xl': 'var(--spacing-2xl)',
      },
      transitionTimingFunction: {
        'ease-in-out': 'var(--ease-in-out)',
        'spring': 'var(--spring)',
        'spring-soft': 'var(--spring-soft)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'shimmer': {
          '0%, 100%': { backgroundPosition: '-100% 0%' },
          '50%': { backgroundPosition: '100% 0%' },
        },
        'float-in': {
          '0%': { opacity: '0', transform: 'translateY(-20px) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'float-in': 'float-in 0.5s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;