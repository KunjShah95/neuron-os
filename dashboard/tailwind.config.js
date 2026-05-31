/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Serif Display"', "serif"],
        body: ['"DM Sans"', "sans-serif"],
        mono: ['"DM Mono"', "monospace"],
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
          700: "#262422",
          800: "#181716",
          900: "#0B0C0E",
        },
        amber: {
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
      },
      animation: {
        "pulse-soft": "pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "stream": "stream 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
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
      },
    },
  },
  plugins: [],
}
