import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithCredential, getRedirectResult, signOut, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { auth, googleProvider, appleProvider } from '../firebase';
import { cacheReadLastUid, cacheWriteLastUid } from '../lib/offlineCache';

// Nonce utilities for Apple Sign-In
function generateNonce(length = 32) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + charset[x % charset.length], '');
}

async function sha256(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If we had a signed-in user on a previous session (native only), hold the
    // loading screen longer on cold start so an offline boot doesn't flash the
    // sign-in screen before Firebase Auth restores the persisted session.
    const hadLastUid = Capacitor.isNativePlatform() && Boolean(cacheReadLastUid());

    // Safety timeout fires only if onAuthStateChanged never responds. It's
    // cleared inside the auth callback itself so a real auth event that
    // resolves near the deadline can't race with the timeout, which would
    // bounce the user from sign-in screen back to the app.
    let timeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) console.warn('[Auth] timeout - forcing past loading screen');
        return false;
      });
      timeout = null;
    }, hadLastUid ? 15000 : 3000);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      setUser(user);
      setLoading(false);
      if (user?.uid) cacheWriteLastUid(user.uid);
    });

    // Only check redirect result on web (hangs in Capacitor WKWebView)
    if (!Capacitor.isNativePlatform()) {
      getRedirectResult(auth).catch(() => {});
    }

    return () => { unsubscribe(); if (timeout) clearTimeout(timeout); };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({ google: { iOSClientId: '902243550931-jp7aur82tepcpi54r0er41sp2semqamp.apps.googleusercontent.com' } });
      const result = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
      const idToken = result?.result?.idToken;
      if (!idToken) throw new Error('No idToken from Google sign-in');
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
    } else {
      await signInWithPopup(auth, googleProvider);
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({ apple: {} });

      // Generate nonce: hashed goes to Apple, raw goes to Firebase
      const rawNonce = generateNonce();
      const hashedNonce = await sha256(rawNonce);

      const result = await SocialLogin.login({
        provider: 'apple',
        options: { scopes: ['email', 'name'], nonce: hashedNonce },
      });

      const idToken = result?.result?.idToken;
      if (!idToken) throw new Error('No idToken from Apple sign-in');

      // Stash Apple's name immediately (Apple only sends it on first sign-in)
      const profile = result?.result?.profile;
      if (profile?.givenName || profile?.familyName) {
        try {
          localStorage.setItem('apple_pending_name', JSON.stringify({
            givenName: profile.givenName || '',
            familyName: profile.familyName || '',
            email: profile.email || '',
          }));
        } catch { /* localStorage unavailable */ }
      }

      const credential = new OAuthProvider('apple.com').credential({
        idToken,
        rawNonce,
      });

      try {
        await signInWithCredential(auth, credential);
      } catch (error) {
        if (error.code === 'auth/account-exists-with-different-credential') {
          // On native, we can't open a popup to link. Tell user to use Google instead.
          throw new Error('An account with this email already exists. Please sign in with Google instead.');
        }
        throw error;
      }
    } else {
      // Web: use Firebase's built-in Apple popup
      try {
        await signInWithPopup(auth, appleProvider);
      } catch (error) {
        if (error.code === 'auth/account-exists-with-different-credential') {
          // On web, we can link via popup
          const pendingCred = OAuthProvider.credentialFromError(error);
          const googleResult = await signInWithPopup(auth, googleProvider);
          if (pendingCred) {
            const { linkWithCredential } = await import('firebase/auth');
            await linkWithCredential(googleResult.user, pendingCred);
          }
        } else {
          throw error;
        }
      }
    }
  }, []);

  const logOut = useCallback(() => signOut(auth), []);

  return { user, loading, signInWithGoogle, signInWithApple, logOut };
};
