import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Magical Athlete Tracker",
        short_name: "Magical Athlete",
        description:
          "Race tracker, betting, and draft assistant companion app for the Magical Athlete board game.",
        theme_color: "#E5402A",
        background_color: "#E5402A",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the app shell; runtime data (shared storage / your
        // backend) is deliberately NOT cached here — see README.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
});
