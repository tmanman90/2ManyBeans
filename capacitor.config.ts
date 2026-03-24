import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.talmeltzer.coffeehub',
  appName: 'Coffee Hub',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '902243550931-id9eaan23rn6au5jfdq0u0it8pei1lqb.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
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
    CapacitorUpdater: {
      autoUpdate: true,
    },
  },
};

export default config;
