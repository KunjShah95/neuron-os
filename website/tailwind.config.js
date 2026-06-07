/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Geist"', "system-ui", "sans-serif"],
        body: ['"Geist"', "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', '"JetBrains Mono"', "monospace"],
        sans: ['"Geist"', "system-ui", "sans-serif"],
        heading: ['"Geist"', "system-ui", "sans-serif"],
        serif: ['"Instrument Serif"', '"DM Serif Display"', "serif"],
      },
      colors: {
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
        base: "#000000",
        elevated: "#0A0A0A",
        neutral: {
          50: "#fafafa",
          100: "#f5f5f5",
          200: "#e5e5e5",
          300: "#d4d4d4",
          400: "#a3a3a3",
          500: "#737373",
          600: "#525252",
          700: "#404040",
          800: "#262626",
          900: "#171717",
          950: "#0a0a0a",
        },
        accent: {
          DEFAULT: "#3b82f6",
          light: "#60a5fa",
          dark: "#2563eb",
        },
        "state-busy": "#fbbf24",
        "state-ready": "#22c55e",
      },
      animation: {
        "pulse-soft": "pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "typing-cursor": "typing-cursor 0.8s step-end infinite",
        "counter-up": "counter-up 0.6s ease-out both",
        "orb-float-a": "orb-float-a 22s ease-in-out infinite",
        "orb-float-b": "orb-float-b 26s ease-in-out infinite",
        "orb-float-c": "orb-float-c 30s ease-in-out infinite",
        "caret-blink": "caret-blink 1s step-end infinite",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        "typing-cursor": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "counter-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "orb-float-a": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(40px, -30px) scale(1.08)" },
          "66%": { transform: "translate(-30px, 20px) scale(0.95)" },
        },
        "orb-float-b": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(-50px, 30px) scale(0.92)" },
          "66%": { transform: "translate(30px, -40px) scale(1.1)" },
        },
        "orb-float-c": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(20px, 40px) scale(1.05)" },
          "66%": { transform: "translate(-40px, -20px) scale(0.97)" },
        },
        "caret-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      backgroundImage: {
        "cta-glow":
          "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.05) 0%, transparent 70%)",
        "gradient-accent":
          "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
        "gradient-radial-accent":
          "radial-gradient(ellipse 50% 40% at 50% 0%, rgba(59,130,246,.15), transparent 60%)",
      },
    },
  },
  plugins: [],
}
