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

    // Safety timeout — if auth never resolves on native, show sign-in after 3s
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    // Capture any pending redirect result from a previous attempt (web only;
    // on native this triggers iframe setup to authDomain which can interfere
    // with WKWebView auth state)
    if (!Capacitor.isNativePlatform()) {
      getRedirectResult(auth).catch(() => {});
    }

    return () => { unsubscribe(); clearTimeout(timeout); };
  }, []);

  const signIn = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { SocialLogin } = await import('@capgo/capacitor-social-login');
        await SocialLogin.initialize({
          google: {
            webClientId: '902243550931-id9eaan23rn6au5jfdq0u0it8pei1lqb.apps.googleusercontent.com',
            iOSClientId: '902243550931-jp7aur82tepcpi54r0er41sp2semqamp.apps.googleusercontent.com',
            iOSServerClientId: '902243550931-id9eaan23rn6au5jfdq0u0it8pei1lqb.apps.googleusercontent.com',
            mode: 'online',
          },
        });
        const res = await SocialLogin.login({
          provider: 'google',
          options: { scopes: ['email', 'profile'] },
        });
        if (!res?.result?.idToken) {
          alert('Sign-in failed: no token received from Google');
          return;
        }
        const credential = GoogleAuthProvider.credential(res.result.idToken);
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
