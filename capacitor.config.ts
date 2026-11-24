import type { CapacitorConfig } from '@capacitor/cli';

const isDevApp = process.env.TMB_APP_VARIANT === 'dev';
const disableCapgoUpdates = process.env.TMB_DISABLE_CAPGO_UPDATES === '1';

const config: CapacitorConfig = {
  appId: isDevApp ? 'com.talmeltzer.coffeehub.dev' : 'com.talmeltzer.coffeehub',
  appName: isDevApp ? '2manybeans Dev' : '2manybeans',
  webDir: 'dist',
  // The WebView's own colour, shown until the page first paints. Without it iOS
  // uses systemBackground (white, or black in dark mode), which shows whenever
  // the page is slower than the splash cap. Same as `body` in global.css.
  backgroundColor: '#F3EDE4',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
    },
    Keyboard: {
      resize: 'body',
      style: 'LIGHT',
    },
    SplashScreen: {
      // A cap, not the normal length: src/main.jsx hides the splash as soon as
      // the first screen is ready. If that never happens, this ends it.
      launchShowDuration: 4000,
      launchAutoHide: true,
      backgroundColor: '#FAF6F1',
      showSpinner: false,
    },
    CapacitorUpdater: {
      autoUpdate: !disableCapgoUpdates,
      ...(isDevApp ? { defaultChannel: 'dev' } : {}),
    },
  },
};

export default config;
