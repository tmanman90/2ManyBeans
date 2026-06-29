import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const isCapacitor = process.env.CAPACITOR_BUILD === 'true'
const appVariant = process.env.TMB_APP_VARIANT === 'dev' ? 'dev' : 'prod'
const googleIosClientId = appVariant === 'dev'
  ? '902243550931-oapf974v3f78m5plmoh4urqos01cj6v9.apps.googleusercontent.com'
  : '902243550931-jp7aur82tepcpi54r0er41sp2semqamp.apps.googleusercontent.com'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __APP_VARIANT__: JSON.stringify(appVariant),
    __GOOGLE_IOS_CLIENT_ID__: JSON.stringify(googleIosClientId),
  },
  server: {
    // Don't watch generated native projects (Capacitor iOS/Android + SPM
    // checkouts) — they churn and trigger spurious dev reloads.
    watch: { ignored: ['**/ios/**', '**/android/**'] },
  },
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
        manualChunks(id) {
          // Force all 14 onboarding screen files + shared state/shell/hook
          // into a single `onboarding` chunk. Keeps the lazy-loaded entry
          // honest: one fetch on Gate 5 → entire flow is ready. Budget
          // (<120KB gzip) is verified in Phase 5.
          if (id.includes('/src/components/onboarding/')) return 'onboarding';
          if (
            id.includes('/node_modules/firebase/app') ||
            id.includes('/node_modules/firebase/auth') ||
            id.includes('/node_modules/firebase/firestore')
          ) return 'firebase';
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) return 'react';
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
        navigateFallbackDenylist: [/^\/api-costs\.html$/, /^\/landing\.html$/, /^\/privacy-policy\.html$/, /^\/terms\.html$/, /^\/support\.html$/],
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
