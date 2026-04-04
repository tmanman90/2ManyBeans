import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.talmeltzer.coffeehub',
  appName: '2manybeans',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SocialLogin: {
      providers: {
        google: true,
        apple: false,
        facebook: false,
        twitter: false,
      },
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
