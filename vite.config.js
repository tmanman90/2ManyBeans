import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const isCapacitor = process.env.CAPACITOR_BUILD === 'true'

export default defineConfig({
  build: {
    // Stable vendor chunks so Capgo OTA deltas are small per deploy. A JS
    // change in `src/` only invalidates the `app` chunk, not the big vendor
    // bundles. Also lets HTTP/2 parallel-download these.
    rollupOptions: {
      output: {
        // firebase/storage and modern-screenshot are intentionally NOT in
        // this list -- they're both dynamic-imported (src/lib/storage.js and
        // src/components/ShareCard.js respectively) so they get their own
        // lazy chunks that only load on demand. Forcing them into a static
        // group here would defeat those splits.
        manualChunks: {
          firebase: [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
          ],
          react: ['react', 'react-dom'],
        },
      },
    },
    // Keep the chunk warning limit low enough to catch regressions but
    // high enough to avoid noise from the firebase vendor chunk (~180KB gz).
    chunkSizeWarningLimit: 600,
  },
  plugins: [
    react(),
    // Disable PWA service worker for native builds (Capacitor serves from bundled assets)
    ...(!isCapacitor ? [VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // JS/CSS/HTML/fonts are precached for offline first-load. PNG/JPG are
        // cached lazily via runtimeCaching (StaleWhileRevalidate) so a fresh
        // visit doesn't download every image up front. Cuts first-load
        // precache from ~46MB down to just the code + manifest icons.
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 } },
          },
          {
            // Bean photos, share-card backgrounds, nav icons, etc. Fetch on
            // demand, keep a reasonable cache, revalidate in background.
            urlPattern: /\/images\/.*\.(png|jpe?g|webp)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: 'Coffee Hub',
        short_name: 'Coffee Hub',
        start_url: '/',
        display: 'standalone',
        background_color: '#FAF6F1',
        theme_color: '#8B5E3C',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    })] : []),
  ],
})
