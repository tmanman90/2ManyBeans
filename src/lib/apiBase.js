import { Capacitor } from '@capacitor/core';

export const API_BASE = Capacitor.isNativePlatform()
  ? 'https://2manybeans.vercel.app'
  : '';
