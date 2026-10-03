// Used by the web app build (Vite). The artifact build runs the Tailwind CLI directly.
module.exports = {
  plugins: {
    tailwindcss: { config: "./tailwind.config.cjs" },
    autoprefixer: {},
  },
};
