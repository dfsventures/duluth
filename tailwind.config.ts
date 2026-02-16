import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // DFS Lab brand colors extracted from logo
        brand: {
          teal: "#3BBFA0",
          "teal-dark": "#2E9A7E",
          "teal-light": "#6DD5B8",
          blue: "#5BAED6",
          "blue-dark": "#4A8FB5",
          "blue-light": "#A8D8EA",
          sky: "#C5E4F0",
          pale: "#E8F4F8",
        },
        // Semantic tokens
        primary: {
          DEFAULT: "#3BBFA0",
          foreground: "#FFFFFF",
          50: "#E8F8F3",
          100: "#C5EEE1",
          200: "#9DE3CC",
          300: "#6DD5B8",
          400: "#3BBFA0",
          500: "#2E9A7E",
          600: "#237A63",
          700: "#1A5C4B",
          800: "#113D32",
          900: "#091F19",
        },
        secondary: {
          DEFAULT: "#5BAED6",
          foreground: "#FFFFFF",
          50: "#EDF5FB",
          100: "#D4E8F5",
          200: "#A8D8EA",
          300: "#7FC3DD",
          400: "#5BAED6",
          500: "#4A8FB5",
          600: "#3A7194",
          700: "#2B5470",
          800: "#1D384B",
          900: "#0E1C26",
        },
        background: "#FFFFFF",
        foreground: "#1A1A2E",
        muted: {
          DEFAULT: "#F1F5F9",
          foreground: "#64748B",
        },
        accent: {
          DEFAULT: "#E8F4F8",
          foreground: "#1A1A2E",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#FFFFFF",
        },
        border: "#E2E8F0",
        input: "#E2E8F0",
        ring: "#3BBFA0",
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#1A1A2E",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
