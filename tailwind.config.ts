import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{ts,tsx}",
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

        /* UI overhaul phase 1 (Direction A+). Surface tiers... */
        well: "var(--color-well)",
        "row-hover": "var(--color-row-hover)",
        "row-divider": "var(--color-row-divider)",
        wash: "var(--color-wash)",
        attention: {
          DEFAULT: "var(--color-attention)",
          bg: "var(--color-attention-bg)",
        },

        /* ...and tinted status/stage/column pairs: `bg-tone-sky text-tone-sky-ink`.
           Values live in globals.css and src/lib/status-tone.ts (test keeps them in sync). */
        tone: {
          stone: { DEFAULT: "var(--tone-stone-fill)", ink: "var(--tone-stone-ink)" },
          sky: { DEFAULT: "var(--tone-sky-fill)", ink: "var(--tone-sky-ink)" },
          sage: { DEFAULT: "var(--tone-sage-fill)", ink: "var(--tone-sage-ink)" },
          clay: { DEFAULT: "var(--tone-clay-fill)", ink: "var(--tone-clay-ink)" },
          sand: { DEFAULT: "var(--tone-sand-fill)", ink: "var(--tone-sand-ink)" },
          amber: { DEFAULT: "var(--tone-amber-fill)", ink: "var(--tone-amber-ink)" },
        },
      },

      /* Named type roles (spec 5.2). Additive: text-sm/xs/etc. are untouched. */
      fontSize: {
        display: ["32px", { lineHeight: "36px", letterSpacing: "-0.015em", fontWeight: "600" }],
        title: ["24px", { lineHeight: "30px", letterSpacing: "-0.01em", fontWeight: "600" }],
        heading: ["16px", { lineHeight: "22px", fontWeight: "600" }],
        body: ["14px", { lineHeight: "22px" }],
        "body-sm": ["13px", { lineHeight: "20px" }],
        label: ["11px", { lineHeight: "16px" }],
        // Primary CTA text: smaller and tighter than label, since mono caps read large.
        cta: ["10px", { lineHeight: "14px" }],
        caption: ["12px", { lineHeight: "16px" }],
      },

      letterSpacing: {
        label: "0.08em",
        cta: "0.06em",
      },

      boxShadow: {
        float: "var(--shadow-float)",
      },

      transitionTimingFunction: {
        DEFAULT: "var(--ease-out)",
        out: "var(--ease-out)",
        in: "var(--ease-in)",
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
        DEFAULT: "120ms",
        fast: "120ms",
        base: "200ms",
        slow: "280ms",
      },

      keyframes: {
        "skeleton-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "overlay-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "dialog-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        "sheet-in": {
          from: { transform: "translateX(24px)", opacity: "0" },
          to: { transform: "none", opacity: "1" },
        },
        "toast-in": {
          from: { transform: "translateY(16px)", opacity: "0" },
          to: { transform: "none", opacity: "1" },
        },
        "toast-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        // A card that just moved or arrived: a Sky wash that fades to the surface.
        land: {
          "0%": { backgroundColor: "rgb(91 141 197 / 0.28)", transform: "translateY(-3px)" },
          "100%": { backgroundColor: "var(--color-surface)", transform: "none" },
        },
        "overlay-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "dialog-out": {
          from: { opacity: "1", transform: "none" },
          to: { opacity: "0", transform: "translateY(6px)" },
        },
        "sheet-out": {
          from: { transform: "none", opacity: "1" },
          to: { transform: "translateX(24px)", opacity: "0" },
        },
      },
      animation: {
        "skeleton-pulse": "skeleton-pulse 1.4s ease-in-out infinite",
        "overlay-in": "overlay-in 200ms var(--ease-out)",
        "dialog-in": "dialog-in 200ms var(--ease-out)",
        "sheet-in": "sheet-in 280ms var(--ease-out)",
        "toast-in": "toast-in 200ms var(--ease-out)",
        "toast-out": "toast-out 120ms var(--ease-in) forwards",
        land: "land 1.4s var(--ease-out)",
        "overlay-out": "overlay-out 120ms var(--ease-in) forwards",
        "dialog-out": "dialog-out 120ms var(--ease-in) forwards",
        "sheet-out": "sheet-out 160ms var(--ease-in) forwards",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
