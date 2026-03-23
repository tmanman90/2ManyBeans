import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.talmeltzer.coffeehub',
  appName: 'Coffee Hub',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT', // dark text on light background
      backgroundColor: '#FAF6F1',
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
  },
};

export default config;
