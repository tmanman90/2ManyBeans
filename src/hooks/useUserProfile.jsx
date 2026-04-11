import { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } from 'react';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { db } from '../firebase';
import { cacheRead, cacheWrite } from '../lib/offlineCache';

// Default preferences for new users and existing user migration
const DEFAULT_PREFERENCES = {
  grinder: 'fellow-ode-gen2',
  grinderCustomName: null,
  brewMethod: 'aiden',
  grindSizeDisplay: 'default',
  canisterCount: 3,
};

// --- Context (co-located with hook) ---

const UserPreferencesContext = createContext(null);

export const UserPreferencesProvider = ({ value, children }) => (
  <UserPreferencesContext value={value}>
    {children}
  </UserPreferencesContext>
);

export const usePreferences = () => {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within UserPreferencesProvider');
  return ctx;
};

// --- Hook ---

export const useUserProfile = (uid) => {
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setLoaded(false);
      setLoadError(false);
      return;
    }

    const profileRef = doc(db, 'users', uid);

    if (Capacitor.isNativePlatform()) {
      // Native: load from IDB cache first for instant render, then fetch
      // from Firestore in background to get fresh data. Cache reads are
      // async (IDB) so we hydrate inside a cancellable async IIFE.
      const cacheKey = `profile_${uid}`;
      let hydrateCancelled = false;
      let hadCache = false;
      (async () => {
        const cached = await cacheRead(cacheKey);
        if (hydrateCancelled) return;
        if (cached) {
          setProfile(cached);
          setLoaded(true);
          hadCache = true;
        }
      })();

      // Network fetch with retry (updates cache on success)
      const loadProfile = (attempt = 1) => {
        getDoc(profileRef).then(snap => {
          if (snap.exists()) {
            const fresh = { id: snap.id, ...snap.data() };
            setProfile(fresh);
            cacheWrite(cacheKey, fresh);
          } else {
            setProfile(null); // genuinely doesn't exist
          }
          setLoaded(true);
          setLoadError(false);
        }).catch(err => {
          console.error(`[Profile] Load attempt ${attempt} failed:`, err);
          if (attempt < 3) {
            setTimeout(() => loadProfile(attempt + 1), 1000 * attempt);
          } else {
            // Only show error if we have no cached data to fall back on
            if (!hadCache) {
              setLoadError(true);
            }
            setLoaded(true);
          }
        });
      };
      loadProfile();
      return () => { hydrateCancelled = true; };
    } else {
      // Web: real-time listener
      const unsub = onSnapshot(profileRef, (snap) => {
        if (snap.exists()) {
          setProfile({ id: snap.id, ...snap.data() });
        } else {
          setProfile(null);
        }
        setLoaded(true);
      }, (err) => {
        console.error('[Profile] Listener error:', err);
        setProfile(null);
        setLoaded(true);
      });
      return unsub;
    }
  }, [uid]);

  // Create profile for a brand new user (from onboarding)
  const createProfile = useCallback(async (userData) => {
    if (!uid) return;
    const profileRef = doc(db, 'users', uid);
    const profileData = {
      displayName: userData.displayName || '',
      email: userData.email || null,
      photoURL: userData.photoURL || null,
      signUpProvider: userData.signUpProvider || 'unknown',
      username: null,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      onboardingComplete: userData.onboardingComplete || false,
      marketingConsent: userData.marketingConsent || false,
      marketingConsentDate: userData.marketingConsent ? serverTimestamp() : null,
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...(userData.preferences || {}),
      },
    };
    await setDoc(profileRef, profileData);
    // Optimistic local update + cache
    const localProfile = { id: uid, ...profileData, createdAt: new Date(), lastLoginAt: new Date() };
    setProfile(localProfile);
    cacheWrite(`profile_${uid}`, localProfile);
  }, [uid]);

  // Migrate an existing user (has beans but no profile doc)
  const migrateExistingUser = useCallback(async (user) => {
    if (!uid) return;
    const profileRef = doc(db, 'users', uid);

    // Check for stashed Apple name
    let displayName = user.displayName || '';
    try {
      const stashed = JSON.parse(localStorage.getItem('apple_pending_name') || 'null');
      if (stashed && !displayName) {
        displayName = `${stashed.givenName} ${stashed.familyName}`.trim();
        localStorage.removeItem('apple_pending_name');
      }
    } catch { /* ignore */ }

    const profileData = {
      displayName,
      email: user.email || null,
      photoURL: user.photoURL || null,
      signUpProvider: user.providerData?.[0]?.providerId || 'unknown',
      username: null,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      onboardingComplete: true, // existing users skip onboarding
      marketingConsent: false,
      marketingConsentDate: null,
      preferences: DEFAULT_PREFERENCES,
    };
    await setDoc(profileRef, profileData, { merge: true });
    const localProfile = { id: uid, ...profileData, createdAt: new Date(), lastLoginAt: new Date() };
    setProfile(localProfile);
    cacheWrite(`profile_${uid}`, localProfile);
  }, [uid]);

  // Update specific preferences using dot notation
  const updatePreferences = useCallback(async (partialPrefs) => {
    if (!uid) return;
    const profileRef = doc(db, 'users', uid);
    const updates = {};
    for (const [key, value] of Object.entries(partialPrefs)) {
      updates[`preferences.${key}`] = value;
    }
    await updateDoc(profileRef, updates);
    // Optimistic local update + cache
    setProfile(prev => {
      if (!prev) return prev;
      const updated = { ...prev, preferences: { ...prev.preferences, ...partialPrefs } };
      cacheWrite(`profile_${uid}`, updated);
      return updated;
    });
  }, [uid]);

  // Update profile fields (displayName, username, marketingConsent, etc.)
  // Use localOnly: true for fields written by Admin SDK (e.g. fellow.*)
  const updateProfile = useCallback(async (partialProfile, { localOnly = false } = {}) => {
    if (!uid) return;
    if (!localOnly) {
      const profileRef = doc(db, 'users', uid);
      await updateDoc(profileRef, partialProfile);
    }
    // Optimistic local update + cache
    setProfile(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...partialProfile };
      cacheWrite(`profile_${uid}`, updated);
      return updated;
    });
  }, [uid]);

  // Complete onboarding
  const completeOnboarding = useCallback(async () => {
    if (!uid) return;
    const profileRef = doc(db, 'users', uid);
    await updateDoc(profileRef, { onboardingComplete: true });
    setProfile(prev => {
      if (!prev) return prev;
      const updated = { ...prev, onboardingComplete: true };
      cacheWrite(`profile_${uid}`, updated);
      return updated;
    });
  }, [uid]);

  // Stabilize preferences reference: only change when values actually differ
  const prevPrefsRef = useRef(null);
  const preferences = useMemo(() => {
    const next = profile?.preferences || DEFAULT_PREFERENCES;
    if (prevPrefsRef.current && JSON.stringify(prevPrefsRef.current) === JSON.stringify(next)) {
      return prevPrefsRef.current;
    }
    prevPrefsRef.current = next;
    return next;
  }, [profile?.preferences]);

  const isOnboarded = profile?.onboardingComplete === true;

  // Fellow connection status (primitive to avoid re-render cascades)
  const fellowConnected = profile?.fellow?.connected ?? false;

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    preferences,
    updatePreferences,
    fellowConnected,
  }), [preferences, updatePreferences, fellowConnected]);

  return {
    profile,
    profileLoaded: loaded,
    profileLoadError: loadError,
    preferences,
    isOnboarded,
    createProfile,
    migrateExistingUser,
    updatePreferences,
    updateProfile,
    completeOnboarding,
    contextValue,
  };
};
