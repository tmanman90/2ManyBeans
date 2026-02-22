import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, getRedirectResult, signOut } from 'firebase/auth';
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
    // signInWithPopup works in both browser and iOS standalone PWA mode
    // (iOS 16.4+ supports popups in standalone via in-app browser sheet).
    // signInWithRedirect does NOT work in standalone mode because the
    // redirect completes in a separate browser context that can't pass
    // auth state back to the standalone app.
    await signInWithPopup(auth, googleProvider);
  }, []);

  const logOut = useCallback(() => signOut(auth), []);

  return { user, loading, signIn, logOut };
};
