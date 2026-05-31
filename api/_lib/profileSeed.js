import { FieldValue } from 'firebase-admin/firestore';

export const DEFAULT_PROFILE_PREFERENCES = {
  grinder: 'fellow-ode-gen2',
  grinderCustomName: null,
  brewMethod: 'aiden',
  grindSizeDisplay: 'default',
  canisterCount: 3,
};

function normalizeDisplayName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 100);
}

export function buildServerProfileSeed({ decodedToken, subscription } = {}) {
  const profile = {
    displayName: normalizeDisplayName(decodedToken?.name) || 'Coffee Lover',
    email: decodedToken?.email || null,
    photoURL: decodedToken?.picture || null,
    signUpProvider: decodedToken?.firebase?.sign_in_provider || 'unknown',
    username: null,
    createdAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
    onboardingComplete: false,
    marketingConsent: false,
    marketingConsentDate: null,
    preferences: DEFAULT_PROFILE_PREFERENCES,
  };

  if (subscription) {
    profile.subscription = subscription;
  }

  return profile;
}
