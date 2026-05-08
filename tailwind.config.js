/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        serif: ['"Noto Serif SC"', 'serif'],
      },
      boxShadow: {
        glow: '0 24px 80px rgba(30, 41, 59, 0.18)',
        stone: 'inset 0 4px 8px rgba(255,255,255,.18), inset 0 -8px 20px rgba(0,0,0,.3), 0 10px 22px rgba(15,23,42,.25)',
      },
      animation: {
        'stone-in': 'stoneIn .22s cubic-bezier(.2,.8,.2,1)',
        'soft-pulse': 'softPulse 2.4s ease-in-out infinite',
        'panel-in': 'panelIn .28s ease-out both',
      },
      keyframes: {
        stoneIn: {
          '0%': { transform: 'translate(-50%, -50%) scale(.35)', opacity: '0' },
          '70%': { transform: 'translate(-50%, -50%) scale(1.08)', opacity: '1' },
          '100%': { transform: 'translate(-50%, -50%) scale(1)', opacity: '1' },
        },
        softPulse: {
          '0%, 100%': { opacity: '.55' },
          '50%': { opacity: '1' },
        },
        panelIn: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
