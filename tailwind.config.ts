import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: "var(--color-bg)",
        foreground: "var(--color-text-primary)",

        primary: {
          DEFAULT: "rgb(var(--color-accent-rgb) / <alpha-value>)",
          foreground: "#FFFFFF",
          hover: "var(--color-accent-hover)",
          50: "var(--color-primary-50)",
          100: "var(--color-primary-100)",
          500: "var(--color-primary-500)",
          600: "var(--color-primary-600)",
          700: "var(--color-primary-700)",
        },

        muted: {
          DEFAULT: "rgb(var(--color-muted-rgb) / <alpha-value>)",
          foreground: "var(--color-text-muted)",
        },

        accent: {
          DEFAULT: "var(--color-powder)",
          foreground: "var(--color-text-primary)",
        },

        destructive: {
          DEFAULT: "rgb(var(--color-destructive-rgb) / <alpha-value>)",
          foreground: "#FFFFFF",
        },

        border: "var(--color-border)",
        input: "var(--color-border)",
        ring: "var(--color-accent)",

        card: {
          DEFAULT: "var(--color-surface)",
          foreground: "var(--color-text-primary)",
        },

        secondary: {
          DEFAULT: "var(--color-text-secondary)",
          foreground: "var(--color-text-primary)",
        },
      },

      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "8px",
        xl: "8px",
        "2xl": "12px",
        full: "9999px",
      },

      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },

      transitionDuration: {
        DEFAULT: "180ms",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
