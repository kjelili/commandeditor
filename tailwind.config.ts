import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        ink: {
          50: '#f7f6f3',
          100: '#ede9e0',
          200: '#d9d1c0',
          300: '#bfb199',
          400: '#a68e72',
          500: '#8c7055',
          600: '#6e5540',
          700: '#54402e',
          800: '#3a2c1e',
          900: '#1e1510',
          950: '#100b08',
        },
        paper: '#faf9f6',
        cream: '#f2ede3',
        gold: {
          400: '#d4a843',
          500: '#c49a2e',
          600: '#a67f20',
        },
        moss: {
          400: '#7a9e6e',
          500: '#5e8050',
          600: '#456038',
        },
        azure: {
          400: '#5b8db8',
          500: '#3d6e9e',
          600: '#2a5280',
        },
        ember: {
          400: '#d4654a',
          500: '#c04832',
          600: '#a03020',
        },
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      animation: {
        'fade-up': 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-in': 'slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      backgroundImage: {
        'grain': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
      },
      boxShadow: {
        'ink-sm': '0 1px 3px rgba(30,21,16,0.12), 0 1px 2px rgba(30,21,16,0.08)',
        'ink-md': '0 4px 12px rgba(30,21,16,0.10), 0 2px 6px rgba(30,21,16,0.06)',
        'ink-lg': '0 8px 30px rgba(30,21,16,0.12), 0 4px 12px rgba(30,21,16,0.08)',
        'ink-xl': '0 20px 60px rgba(30,21,16,0.15), 0 8px 24px rgba(30,21,16,0.10)',
        'glow-gold': '0 0 20px rgba(212, 168, 67, 0.25)',
        'glow-moss': '0 0 20px rgba(94, 128, 80, 0.25)',
      },
    },
  },
  plugins: [],
}
export default config
