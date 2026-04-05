import { useState, useEffect, useCallback, createContext, useContext, useMemo } from 'react';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { db } from '../firebase';

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

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setLoaded(false);
      return;
    }

    const profileRef = doc(db, 'users', uid);

    if (Capacitor.isNativePlatform()) {
      // Native: single read at boot, no polling (profile changes only in-app)
      getDoc(profileRef).then(snap => {
        if (snap.exists()) {
          setProfile({ id: snap.id, ...snap.data() });
        } else {
          setProfile(null);
        }
        setLoaded(true);
      }).catch(err => {
        console.error('[Profile] Failed to load:', err);
        setProfile(null);
        setLoaded(true);
      });
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
    // Optimistic local update
    setProfile({ id: uid, ...profileData, createdAt: new Date(), lastLoginAt: new Date() });
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
    setProfile({ id: uid, ...profileData, createdAt: new Date(), lastLoginAt: new Date() });
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
    // Optimistic local update
    setProfile(prev => prev ? {
      ...prev,
      preferences: { ...prev.preferences, ...partialPrefs },
    } : prev);
  }, [uid]);

  // Update profile fields (displayName, username, marketingConsent, etc.)
  const updateProfile = useCallback(async (partialProfile) => {
    if (!uid) return;
    const profileRef = doc(db, 'users', uid);
    await updateDoc(profileRef, partialProfile);
    // Optimistic local update
    setProfile(prev => prev ? { ...prev, ...partialProfile } : prev);
  }, [uid]);

  // Complete onboarding
  const completeOnboarding = useCallback(async () => {
    if (!uid) return;
    const profileRef = doc(db, 'users', uid);
    await updateDoc(profileRef, { onboardingComplete: true });
    setProfile(prev => prev ? { ...prev, onboardingComplete: true } : prev);
  }, [uid]);

  const preferences = profile?.preferences || DEFAULT_PREFERENCES;
  const isOnboarded = profile?.onboardingComplete === true;

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    preferences,
    updatePreferences,
  }), [preferences, updatePreferences]);

  return {
    profile,
    profileLoaded: loaded,
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
