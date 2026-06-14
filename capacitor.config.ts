import type { CapacitorConfig } from '@capacitor/cli';

const isDevApp = process.env.TMB_APP_VARIANT === 'dev';
const disableCapgoUpdates = process.env.TMB_DISABLE_CAPGO_UPDATES === '1';

const config: CapacitorConfig = {
  appId: isDevApp ? 'com.talmeltzer.coffeehub.dev' : 'com.talmeltzer.coffeehub',
  appName: isDevApp ? '2manybeans Dev' : '2manybeans',
  webDir: 'dist',
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
      launchShowDuration: 2000,
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
