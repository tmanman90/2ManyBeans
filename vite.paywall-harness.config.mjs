// Vite config for the paywall screenshot harness: swaps the native RevenueCat
// plugin for a fake StoreKit payload so the real PaywallSheet code path runs in
// a browser. Everything else matches the app config (react plugin only — no PWA).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('harness'),
    __APP_VARIANT__: JSON.stringify('dev'),
    __GOOGLE_IOS_CLIENT_ID__: JSON.stringify(''),
  },
  resolve: {
    alias: {
      '@revenuecat/purchases-capacitor': '/paywall-harness-rc-mock.js',
    },
  },
  server: { watch: { ignored: ['**/ios/**', '**/android/**'] } },
  plugins: [react()],
});
