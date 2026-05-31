export const DEFAULT_PREFERENCES = {
  grinder: 'fellow-ode-gen2',
  grinderCustomName: null,
  brewMethod: 'aiden',
  grindSizeDisplay: 'default',
  canisterCount: 3,
};

export function normalizeDisplayName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 100);
}

export function stashedDisplayName(raw) {
  if (!raw || typeof raw !== 'object') return '';
  return normalizeDisplayName(
    raw.displayName
    || raw.name
    || raw.fullName
    || [raw.givenName, raw.familyName].filter(Boolean).join(' ')
  );
}

export function cleanPreferencePatch(preferences) {
  const cleanPrefs = {};
  if (!preferences || typeof preferences !== 'object') return cleanPrefs;

  for (const [key, value] of Object.entries(preferences)) {
    if (value !== null && value !== undefined && value !== '') {
      cleanPrefs[key] = value;
    }
  }

  return cleanPrefs;
}

export function buildProfileCompletionBase({
  profile,
  user,
  answers,
  pendingDisplayName,
  timestamp,
}) {
  const answerPrefs =
    answers?.preferences && typeof answers.preferences === 'object'
      ? answers.preferences
      : {};
  const cleanPrefs = cleanPreferencePatch(answerPrefs);
  const existingPrefs =
    profile?.preferences && typeof profile.preferences === 'object'
      ? profile.preferences
      : {};
  const hasMarketingConsent = typeof answers?.marketingConsent === 'boolean';
  const marketingConsent = hasMarketingConsent
    ? answers.marketingConsent
    : (typeof profile?.marketingConsent === 'boolean' ? profile.marketingConsent : false);

  return {
    displayName:
      normalizeDisplayName(profile?.displayName)
      || normalizeDisplayName(user?.displayName)
      || normalizeDisplayName(answerPrefs.displayName)
      || normalizeDisplayName(pendingDisplayName)
      || 'Coffee Lover',
    email: profile?.email || user?.email || null,
    photoURL: profile?.photoURL || user?.photoURL || null,
    signUpProvider: profile?.signUpProvider || user?.providerData?.[0]?.providerId || 'unknown',
    username: Object.prototype.hasOwnProperty.call(profile || {}, 'username') ? profile.username : null,
    createdAt: profile?.createdAt || timestamp,
    lastLoginAt: profile?.lastLoginAt || timestamp,
    marketingConsent,
    marketingConsentDate: marketingConsent
      ? (hasMarketingConsent ? timestamp : (profile?.marketingConsentDate || timestamp))
      : null,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...existingPrefs,
      ...cleanPrefs,
    },
  };
}
