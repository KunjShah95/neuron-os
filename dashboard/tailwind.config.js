/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Inter"', "system-ui", "sans-serif"],
        body: ['"Barlow"', '"Inter"', "sans-serif"],
        mono: ['"DM Mono"', "monospace"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        heading: ['"Inter"', "system-ui", "sans-serif"],
        serif: ['"Instrument Serif"', '"DM Serif Display"', "serif"],
      },
      colors: {
        surface: {
          DEFAULT: "#0B0C0E",
          50: "#F8F7F4",
          100: "#EDECE9",
          200: "#D4D2CE",
          300: "#A8A5A0",
          400: "#7C7975",
          500: "#52504D",
          600: "#3A3836",
          700: "#1a1a1c",
          800: "#101012",
          900: "#0B0C0E",
          950: "#050505",
        },
        ink: {
          50: "rgba(255, 255, 255, 0.95)",
          100: "rgba(255, 255, 255, 0.85)",
          200: "rgba(255, 255, 255, 0.7)",
          300: "rgba(255, 255, 255, 0.55)",
          400: "rgba(255, 255, 255, 0.4)",
          500: "rgba(255, 255, 255, 0.3)",
          600: "rgba(255, 255, 255, 0.18)",
          700: "rgba(255, 255, 255, 0.1)",
          800: "rgba(255, 255, 255, 0.05)",
        },
        amber: {
          300: "#FBBF24",
          400: "#F59E0B",
          500: "#D97706",
        },
        cyan: {
          400: "#22D3EE",
          500: "#06B6D4",
        },
        rose: {
          400: "#FB7185",
          500: "#F43F5E",
        },
        violet: {
          400: "#A78BFA",
          500: "#8B5CF6",
        },
        emerald: {
          400: "#34D399",
          500: "#10B981",
        },
        brand: {
          cyan: "#22D3EE",
          violet: "#8B5CF6",
          amber: "#F59E0B",
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "stream": "stream 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "float": "float 6s ease-in-out infinite",
        "float-slow": "float 10s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "beam-slide": "beam-slide 2s ease-in-out",
        "typing-cursor": "typing-cursor 0.8s step-end infinite",
        "grid-fade": "grid-fade 4s ease-in-out infinite",
        "counter-up": "counter-up 0.6s ease-out both",
        "dot-drift": "dot-drift 20s ease-in-out infinite",
        "hairline-sweep": "hairline-sweep 6s linear infinite",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "stream": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        "beam-slide": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "typing-cursor": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "grid-fade": {
          "0%": { opacity: "0" },
          "50%": { opacity: "0.3" },
          "100%": { opacity: "0" },
        },
        "counter-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "dot-drift": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(10px, -15px)" },
          "50%": { transform: "translate(-5px, 10px)" },
          "75%": { transform: "translate(15px, 5px)" },
        },
        "hairline-sweep": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(ellipse at center, var(--tw-gradient-stops))",
        "hero-glow": "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 40%, transparent 70%)",
        "cta-glow": "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.05) 0%, transparent 70%)",
      },
    },
  },
  plugins: [],
}
