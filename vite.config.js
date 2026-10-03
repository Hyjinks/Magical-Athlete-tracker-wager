// Hosted web app build: npm run build:web → dist-web/ (deployed to Firebase Hosting).
// The claude.ai artifact is built separately by scripts/build-artifact.mjs from
// the same source.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // A new version installs itself the next time the app is opened, so
      // nobody at game night is stuck on an old copy.
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Magical Athlete",
        short_name: "Magical Athlete",
        description: "Race tracker, betting and draft companion for the Magical Athlete board game.",
        theme_color: "#E5402A",
        background_color: "#E5402A",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The whole app is cached, so it opens even on patchy venue Wi-Fi.
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        // Keep the Google Fonts once fetched, so headings look right offline.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    // Older iPhones are expected at the table.
    target: ["es2020", "safari15"],
    // Firestore is one ~560 KB chunk. It's only downloaded when spectator
    // betting is used (see src/storage-shared-firebase.js), so it's not worth
    // a warning on every build.
    chunkSizeWarningLimit: 600,
  },
});
