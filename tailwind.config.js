/** @type {import('tailwindcss').Config} */
// CSS-variable colors that still support opacity modifiers (bg-surface/80, bg-ink/[0.06]…)
const v = (name) => `color-mix(in srgb, var(${name}) calc(<alpha-value> * 100%), transparent)`

module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design tokens (design.md §2) — CSS variables switch via [data-theme="dark"]
        bg: v("--bg"),
        surface: {
          DEFAULT: v("--surface"),
          2: v("--surface-2"),
          3: v("--surface-3"),
        },
        ink: {
          DEFAULT: v("--text"),
          muted: v("--text-muted"),
          faint: v("--text-faint"),
        },
        terra: {
          DEFAULT: v("--accent"),
          hover: v("--accent-hover"),
          soft: v("--accent-soft"),
          ink: v("--accent-ink"),
        },
        st: {
          learned: v("--st-learned"),
          learning: v("--st-learning"),
          weak: v("--st-weak"),
          due: v("--st-due"),
          new: v("--st-new"),
        },
        success: v("--success"),
        error: v("--error"),
        warning: v("--warning"),
        info: v("--info"),
        // shadcn/ui aliases mapped onto the design tokens
        border: v("--border"),
        "border-strong": v("--border-strong"),
        input: v("--border"),
        ring: v("--accent"),
        background: v("--bg"),
        foreground: v("--text"),
        primary: { DEFAULT: v("--accent"), foreground: "#FFFFFF" },
        secondary: { DEFAULT: v("--surface-2"), foreground: v("--text") },
        destructive: { DEFAULT: v("--error"), foreground: "#FFFFFF" },
        muted: { DEFAULT: v("--surface-2"), foreground: v("--text-muted") },
        accent: { DEFAULT: v("--accent-soft"), foreground: v("--accent-ink") },
        popover: { DEFAULT: v("--surface"), foreground: v("--text") },
        card: { DEFAULT: v("--surface"), foreground: v("--text") },
        sidebar: {
          DEFAULT: v("--surface"),
          foreground: v("--text"),
          primary: v("--accent"),
          "primary-foreground": "#FFFFFF",
          accent: v("--surface-2"),
          "accent-foreground": v("--text"),
          border: v("--border"),
          ring: v("--accent"),
        },
      },
      fontFamily: {
        display: ["-apple-system", "BlinkMacSystemFont", "'SF Pro Display'", "Inter", "system-ui", "sans-serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", "'SF Pro Text'", "Inter", "system-ui", "sans-serif"],
        // numerals use the system face with tabular figures (see .font-mono in index.css)
        mono: ["-apple-system", "BlinkMacSystemFont", "'SF Pro Text'", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "3xl": "2rem",
        "2xl": "1.625rem",
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: v("--radix-accordion-content-height") },
        },
        "accordion-up": {
          from: { height: v("--radix-accordion-content-height") },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "due-pulse": {
          "0%": { boxShadow: "0 0 0 0 var(--st-due-soft)" },
          "70%": { boxShadow: "0 0 0 8px transparent" },
          "100%": { boxShadow: "0 0 0 0 transparent" },
        },
        "flame-sway": {
          "0%,100%": { transform: "rotate(-4deg)" },
          "50%": { transform: "rotate(4deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "due-pulse": "due-pulse 2.4s ease-out infinite",
        "flame-sway": "flame-sway 3s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
