import type { Config } from "tailwindcss";
import path from "node:path";

// Scan the active content dir (set by the CLI / .env.local) so utility classes
// used inside authored MDX aren't purged, wherever the consumer's docs live.
const contentEnv = process.env.MARKLINE_CONTENT;
const contentGlob = contentEnv
  ? path.join(path.isAbsolute(contentEnv) ? contentEnv : path.join(process.cwd(), contentEnv), "**/*.{md,mdx}")
  : "../_docs/**/*.{md,mdx}";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,md,mdx}",
    "./components/**/*.{ts,tsx}",
    contentGlob,
    // The content dir is the consumer's project root — don't scan its deps/build.
    "!**/node_modules/**",
    "!**/.markline/**",
    "!**/out/**",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Stack blue — primary accent (Propeller brand)
        stack: {
          100:  "#EEF4FE",
          200:  "#D0E1FC",
          300:  "#B1CEF9",
          400:  "#73A9F4",
          500:  "#3C87F0",
          600:  "#0C68EB",
          700:  "#0A53A8",
          800:  "#083A78",
          900:  "#06254F",
          1000: "#03142F",
        },

        // Midnight — neutral palette
        midnight: {
          100:  "#FFFFFF",
          200:  "#F6F7FA",
          300:  "#ECEEF3",
          400:  "#D7DADF",
          500:  "#C7CBD1",
          600:  "#8E959C",
          700:  "#646A71",
          800:  "#4A5056",
          900:  "#343A40",
          1000: "#242B31",
          1100: "#0E141B",
        },

        // Golden yellow — secondary accent
        gold: {
          100:  "#FFF8E8",
          200:  "#FFF3D3",
          300:  "#FFE7A4",
          400:  "#FFE08B",
          500:  "#FFD459",
          600:  "#FFC522",
          700:  "#A66D00",
          800:  "#704700",
          900:  "#4A2F00",
          1000: "#2A1A00",
        },

        // Semantic aliases (CSS-var driven so they flip with theme)
        brand:      "rgb(var(--c-brand) / <alpha-value>)",
        "brand-deep":"rgb(var(--c-brand-deep) / <alpha-value>)",
        "brand-mute":"rgb(var(--c-brand-mute) / <alpha-value>)",
        "on-brand":  "rgb(var(--c-on-brand) / <alpha-value>)",

        ink:       "rgb(var(--c-ink) / <alpha-value>)",
        "ink-soft":"rgb(var(--c-ink-soft) / <alpha-value>)",
        "ink-2":   "rgb(var(--c-ink-2) / <alpha-value>)",
        "ink-3":   "rgb(var(--c-ink-3) / <alpha-value>)",

        paper:   "rgb(var(--c-paper) / <alpha-value>)",
        "paper-2":"rgb(var(--c-paper-2) / <alpha-value>)",

        "slate-0": "rgb(var(--c-slate-0) / <alpha-value>)",
        "slate-1": "rgb(var(--c-slate-1) / <alpha-value>)",
        "slate-2": "rgb(var(--c-slate-2) / <alpha-value>)",
        "slate-3": "rgb(var(--c-slate-3) / <alpha-value>)",
        "slate-4": "rgb(var(--c-slate-4) / <alpha-value>)",
        "slate-5": "rgb(var(--c-slate-5) / <alpha-value>)",
        "slate-6": "rgb(var(--c-slate-6) / <alpha-value>)",
        "slate-7": "rgb(var(--c-slate-7) / <alpha-value>)",
        "slate-8": "rgb(var(--c-slate-8) / <alpha-value>)",

        // Signals
        "signal-up":   "#17B04A",
        "signal-down": "#CE2121",
        "signal-info": "#0C68EB",
        "signal-warn": "#E8571F",
      },
      fontFamily: {
        sans:  ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:  ["var(--font-geist-mono)", "ui-monospace", "'SF Mono'", "Menlo", "monospace"],
      },
      fontSize: {
        "10": ["10px", {}],
        "11": ["11px", {}],
        "12": ["12px", {}],
        "13": ["13px", {}],
        "14": ["14px", {}],
        "15": ["15px", { lineHeight: "1.5" }],
        "16": ["16px", {}],
        "17": ["17px", {}],
        "18": ["18px", {}],
        "20": ["20px", {}],
        "24": ["24px", {}],
        "28": ["28px", {}],
        "36": ["36px", {}],
        "48": ["48px", { lineHeight: "1.15" }],
        "64": ["64px", { lineHeight: "1.05" }],
      },
      maxWidth: {
        marketing: "1200px",
        console:   "1440px",
        prose:     "64ch",
      },
      borderRadius: {
        "1": "6px",
        "2": "10px",
        "3": "16px",
        pill: "999px",
      },
      spacing: {
        "1s": "4px",
        "2s": "8px",
        "3s": "12px",
        "4s": "16px",
        "5s": "24px",
        "6s": "32px",
        "7s": "48px",
        "8s": "64px",
        "9s": "96px",
      },
      letterSpacing: {
        "tight":  "-0.02em",
        "normal": "0",
        "wide":   "0.06em",
      },
      boxShadow: {
        "elev-1": "0 1px 0 rgba(15, 15, 14, 0.04), 0 2px 6px rgba(15, 15, 14, 0.04)",
        "elev-2": "0 4px 16px rgba(15, 15, 14, 0.08), 0 1px 0 rgba(15, 15, 14, 0.06)",
      },
      transitionTimingFunction: {
        "sharp": "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      transitionDuration: {
        "160": "160ms",
        "220": "220ms",
        "320": "320ms",
      },
      typography: {
        DEFAULT: { css: { maxWidth: "64ch" } },
      },
    },
  },
  plugins: [],
};

export default config;
