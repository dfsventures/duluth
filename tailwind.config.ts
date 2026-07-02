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
        background: "var(--color-bg)",
        foreground: "var(--color-text-primary)",

        primary: {
          DEFAULT: "rgb(var(--color-accent-rgb) / <alpha-value>)",
          foreground: "var(--color-accent-foreground)",
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
          foreground: "var(--color-destructive-foreground)",
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

        /* DFS brand palette — see ~/.claude/skills/dfs-brand-style */
        paper: "#EBE8DE",
        bone: "#D8D6CB",
        cocoa: "#C9B08A",
        obsidian: "#14140F",
        tide: "#56544B",
        sky: "#5B8DC5",
        tuareg: "#3A5876",
        laterite: "#A65A3E",
        ochre: "#C9963A",
        acacia: "#6E7A3E",
      },

      borderRadius: {
        sm: "1px",
        md: "2px",
        lg: "2px",
        xl: "2px",
        "2xl": "2px",
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
