import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithCredential, getRedirectResult, signOut, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { auth, googleProvider } from '../firebase';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    // Capture any pending redirect result from a previous attempt
    getRedirectResult(auth).catch(() => {});

    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
        await GoogleAuth.initialize({
          clientId: '902243550931-id9eaan23rn6au5jfdq0u0it8pei1lqb.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        });
        const result = await GoogleAuth.signIn();
        const credential = GoogleAuthProvider.credential(result.authentication.idToken);
        await signInWithCredential(auth, credential);
      } catch (err) {
        console.error('Google Sign-In failed:', err);
        alert('Sign-in failed: ' + (err.message || err));
      }
    } else {
      // signInWithPopup works in both browser and iOS standalone PWA mode
      // (iOS 16.4+ supports popups in standalone via in-app browser sheet).
      // signInWithRedirect does NOT work in standalone mode because the
      // redirect completes in a separate browser context that can't pass
      // auth state back to the standalone app.
      await signInWithPopup(auth, googleProvider);
    }
  }, []);

  const logOut = useCallback(() => signOut(auth), []);

  return { user, loading, signIn, logOut };
};
