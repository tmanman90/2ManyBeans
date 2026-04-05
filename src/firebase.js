import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, browserLocalPersistence, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// On native (WKWebView), IndexedDB persistence is unreliable and can hang or
// silently fail, causing signInWithCredential to never update auth state.
// Use initializeAuth with browserLocalPersistence (localStorage) which is
// reliable in WKWebView. On web, getAuth() uses the default persistence
// stack (IndexedDB > localStorage > sessionStorage) which works fine.
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: browserLocalPersistence })
  : getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

// Skip persistent cache on native — IndexedDB hangs in WKWebView
const firestoreSettings = Capacitor.isNativePlatform()
  ? {}
  : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) };

export const db = initializeFirestore(app, firestoreSettings);
export const storage = getStorage(app);
