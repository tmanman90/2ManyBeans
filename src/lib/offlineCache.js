import { Capacitor } from '@capacitor/core';

const PREFIX = 'tmb_';
const isNative = Capacitor.isNativePlatform();

export const cacheWrite = (key, data) => {
  if (!isNative) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch { /* quota exceeded or unavailable — silent */ }
};

export const cacheRead = (key) => {
  if (!isNative) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const cacheClear = (uid) => {
  if (!isNative) return;
  try {
    const suffix = `_${uid}`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX) && key.endsWith(suffix)) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* silent */ }
};
