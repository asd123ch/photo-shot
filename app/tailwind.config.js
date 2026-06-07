/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Identity echoes the chameleon mascot: a turquoise-green (jade) accent
        // on near-black surfaces that carry the same green undertone (hue 170).
        background: 'oklch(0.145 0.006 170)', // green-tinted near-black
        surface: 'oklch(0.215 0.008 170)',    // green-tinted dark panel
        primary: 'oklch(0.72 0.12 170)',      // turquoise-green — the single accent (action / selection / focus)
        accent: 'oklch(0.72 0.12 170)',       // unified to primary (kept as an alias for existing classes)
        // Semantic state tokens (OKLCH). Consistent meaning across every screen.
        success: 'oklch(0.723 0.19 150)',  // green — success only (Copied / EXIF / GPS)
        warning: 'oklch(0.852 0.17 91)',   // amber-yellow
        error: 'oklch(0.637 0.208 25)',    // red
        info: 'oklch(0.62 0.16 252)',      // blue (informational, e.g. the metadata note)
        // Neutral scale, every step tinted toward the brand hue (170) at low
        // chroma so structure harmonises with the surfaces instead of using flat
        // Tailwind grays / pure #000/#fff. Overrides only the shades in use.
        white: 'oklch(0.985 0.004 170)',
        black: 'oklch(0.16 0.006 170)',
        gray: {
          100: 'oklch(0.96 0.005 170)',
          200: 'oklch(0.92 0.006 170)',
          300: 'oklch(0.87 0.008 170)',
          400: 'oklch(0.71 0.014 170)',
          700: 'oklch(0.37 0.013 170)',
          800: 'oklch(0.27 0.012 170)',
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        // ease-out-quint: exponential ease-out, no bounce (per the motion laws)
        'fade-in': 'fade-in 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
