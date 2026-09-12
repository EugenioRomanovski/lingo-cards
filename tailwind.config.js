/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design tokens (design.md §2) — CSS variables switch via [data-theme="dark"]
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        ink: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        terra: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
          ink: "var(--accent-ink)",
        },
        st: {
          learned: "var(--st-learned)",
          learning: "var(--st-learning)",
          weak: "var(--st-weak)",
          due: "var(--st-due)",
          new: "var(--st-new)",
        },
        success: "var(--success)",
        error: "var(--error)",
        warning: "var(--warning)",
        info: "var(--info)",
        // shadcn/ui aliases mapped onto the design tokens
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        input: "var(--border)",
        ring: "var(--accent)",
        background: "var(--bg)",
        foreground: "var(--text)",
        primary: { DEFAULT: "var(--accent)", foreground: "#FFFFFF" },
        secondary: { DEFAULT: "var(--surface-2)", foreground: "var(--text)" },
        destructive: { DEFAULT: "var(--error)", foreground: "#FFFFFF" },
        muted: { DEFAULT: "var(--surface-2)", foreground: "var(--text-muted)" },
        accent: { DEFAULT: "var(--accent-soft)", foreground: "var(--accent-ink)" },
        popover: { DEFAULT: "var(--surface)", foreground: "var(--text)" },
        card: { DEFAULT: "var(--surface)", foreground: "var(--text)" },
        sidebar: {
          DEFAULT: "var(--surface)",
          foreground: "var(--text)",
          primary: "var(--accent)",
          "primary-foreground": "#FFFFFF",
          accent: "var(--surface-2)",
          "accent-foreground": "var(--text)",
          border: "var(--border)",
          ring: "var(--accent)",
        },
      },
      fontFamily: {
        display: ["Spectral", "Georgia", "serif"],
        sans: ["Manrope", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
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
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
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
