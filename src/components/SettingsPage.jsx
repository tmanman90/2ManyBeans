// Settings page — iOS grouped table style, full-screen page sheet modal
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, LogOut, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { doc, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { C, fonts, shadows, radius, type as typeScale, glass, motion as motionTokens } from '../styles/theme';
import { haptic } from '../lib/haptics';
import { Toast } from './Toast';
import { usePreferences } from '../hooks/useUserProfile';
import { BREW_DEVICES } from '../lib/brewMethods';
import { useAuthContext } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { restorePurchases, isRevenueCatAvailable, deriveEntitlements } from '../lib/revenuecat';
import { PLAN_LABELS } from '../lib/subscriptionConfig';
import { auth } from '../firebase';
import { db } from '../firebase';
import { fetchWithRetry } from '../lib/fetchWithRetry';
import { API_BASE } from '../lib/apiBase';
import { scrollOnFocus } from '../lib/formHelpers';
import { redeemCode } from '../lib/redeemCode';
import { sanitizeUserText } from '../lib/sanitizeUserText';
import { reauthenticateForAccountDeletion } from '../lib/reauth';

// Reason-code -> user copy for the inline redeem row. Unknown codes fall
// back to a generic message. Kept here (consumer) instead of the helper
// so the copy lives next to the UI that renders it.
// KEEP IN SYNC with: api/redeem-code.js STATUS,
// src/lib/fetchWithRetry.js REDEMPTION_REASONS.
const REDEEM_COPY = {
  invalid_input: "That code doesn't look right. Check it and try again.",
  invalid_code: "That code isn't valid. Double-check it and try again.",
  already_redeemed: "You've already redeemed a code on this account.",
  has_active_subscription: 'You already have Pro. Nothing to redeem.',
  email_not_verified: 'Please verify your email address before redeeming.',
  rate_limited: 'Too many attempts. Please wait an hour and try again.',
};
const REDEEM_GENERIC_ERROR = 'Something went wrong. Please try again in a moment.';

// --- Grinder options ---
const GRINDERS = [
  { key: 'fellow-ode-gen2', label: 'Fellow Ode Gen 2' },
  { key: 'fellow-opus', label: 'Fellow Opus' },
  { key: 'baratza-encore-esp', label: 'Baratza Encore ESP' },
  { key: 'comandante-c40', label: 'Comandante C40 MK4' },
  { key: '1zpresso-jx-pro', label: '1Zpresso JX-Pro' },
  { key: 'baratza-virtuoso-plus', label: 'Baratza Virtuoso+' },
  { key: 'other', label: 'Other / Manual Entry' },
];

const CANISTER_OPTIONS = [1, 2, 3, 4, 5, 6];

// --- Styles ---
const groupStyle = {
  background: C.card,
  borderRadius: radius.lg,
  margin: '0 16px 8px',
  overflow: 'hidden',
  boxShadow: shadows.e2,
  border: `1px solid ${C.hairline}`,
};

const sectionHeaderStyle = {
  ...typeScale.label,
  color: C.textMuted,
  padding: '20px 20px 6px',
  margin: 0,
};

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: 50,
  padding: '12px 16px',
  background: 'transparent',
  border: 'none',
  width: '100%',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  fontFamily: fonts.body,
  fontSize: 16,
};

const separatorStyle = {
  borderBottom: `0.5px solid ${C.hairline}`,
  marginLeft: 16,
};

const rowLabelStyle = {
  color: C.text,
  fontSize: 16,
  fontFamily: fonts.body,
  fontWeight: 500,
  flex: 1,
  minWidth: 0,
};

const rowValueStyle = {
  color: C.textMuted,
  fontSize: 15,
  fontFamily: fonts.body,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
};

const selectStyle = {
  fontFamily: fonts.body, fontSize: 15, color: C.textMuted,
  background: 'transparent', border: 'none',
  appearance: 'none', WebkitAppearance: 'none',
  cursor: 'pointer', textAlign: 'right',
  paddingRight: 0, paddingLeft: 8,
  width: 'auto',
};

export const SettingsPage = ({ open, onClose, profile, updateProfile, uid, beans, refetchBeans }) => {
  const { preferences, updatePreferences } = usePreferences();
  const { logOut } = useAuthContext();
  const { hasPro, hasUltra, plan, status } = useSubscription();
  const { openPaywall } = usePaywall();

  const [toast, setToast] = useState(null);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameValue, setDisplayNameValue] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState('');
  const [canisterConfirm, setCanisterConfirm] = useState(null); // { newCount, overflowBeans }
  const [restoring, setRestoring] = useState(false);
  // Delete Account flow: 'warn' → user reads consequences, 'confirm' → types
  // DELETE, 'deleting' → API in flight. null = modal closed.
  const [deleteStep, setDeleteStep] = useState(null);
  const [deleteInput, setDeleteInput] = useState('');

  // Live OTA bundle id — confirms which Capgo bundle is actually running (vs. the
  // static native version), so update delivery can be verified at a glance.
  const [otaBundle, setOtaBundle] = useState(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    import('@capgo/capacitor-updater')
      .then(({ CapacitorUpdater }) => CapacitorUpdater.current())
      .then((r) => setOtaBundle(r?.bundle?.version || r?.bundle?.id || 'builtin'))
      .catch(() => setOtaBundle('builtin'));
  }, []);

  // Grinder <select> width is pinned to the rendered width of the selected
  // option. Native <select> on iOS WKWebView sizes its intrinsic width using
  // the longest <option>, not the current value, which left a visible gap
  // between "Fellow Ode Gen 2" and the chevron. Measuring the label with a
  // hidden mirror span + setting an explicit width sidesteps WebKit's
  // auto-size logic entirely.
  const grinderMirrorRef = useRef(null);
  const [grinderSelectWidth, setGrinderSelectWidth] = useState(null);
  const grinderLabel =
    (preferences.grinder === 'other'
      ? 'Other / Manual Entry'
      : GRINDERS.find(g => g.key === preferences.grinder)?.label) || 'Fellow Ode Gen 2';

  const measureGrinder = () => {
    if (!grinderMirrorRef.current) return;
    const w = Math.ceil(grinderMirrorRef.current.getBoundingClientRect().width);
    if (w > 0) setGrinderSelectWidth(w + 2);
  };

  useLayoutEffect(() => { measureGrinder(); }, [grinderLabel, open]);

  useEffect(() => {
    if (!document.fonts?.ready) return;
    let cancelled = false;
    document.fonts.ready.then(() => { if (!cancelled) measureGrinder(); });
    return () => { cancelled = true; };
  }, []);

  // Redeem-code inline expand row (Subscription section, !hasPro only).
  // Success state is derived from the Firestore listener flipping hasPro
  // true; this local state is only for the form lifecycle and error copy.
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState(null);
  const [redeemSuccess, setRedeemSuccess] = useState(null); // { expiresAt }

  // Reset redeem state when Settings closes or when the signed-in user
  // changes — without this the component-local state would leak a typed
  // code, error, or success panel into a different session.
  useEffect(() => {
    if (open) return;
    setRedeemOpen(false);
    setRedeemInput('');
    setRedeemError(null);
    setRedeemSuccess(null);
  }, [open]);
  useEffect(() => {
    setRedeemOpen(false);
    setRedeemInput('');
    setRedeemError(null);
    setRedeemSuccess(null);
  }, [uid]);

  // Fellow account connection
  const fellowConnected = profile?.fellow?.connected ?? false;
  const fellowEmail = profile?.fellow?.email ?? null;
  const [fellowFormOpen, setFellowFormOpen] = useState(false);
  const [fellowEmailInput, setFellowEmailInput] = useState('');
  const [fellowPasswordInput, setFellowPasswordInput] = useState('');
  const [fellowLoading, setFellowLoading] = useState(false);
  const [fellowError, setFellowError] = useState(null);

  // --- Fellow account handlers ---

  const handleFellowConnect = async () => {
    setFellowError(null);
    setFellowLoading(true);
    try {
      await fetchWithRetry({
        url: `${API_BASE}/api/fellow?action=connect`,
        body: { email: fellowEmailInput.trim(), password: fellowPasswordInput },
        retries: 1,
        serviceName: 'Fellow',
      });
      // Update local profile state (server already wrote to Firestore via Admin SDK)
      await updateProfile({ fellow: { connected: true, email: fellowEmailInput.trim() } }, { localOnly: true });
      haptic.light();
      setToast('Fellow account connected');
      setFellowFormOpen(false);
      setFellowEmailInput('');
      setFellowPasswordInput('');
    } catch (err) {
      setFellowError(err.message || 'Connection failed');
    }
    setFellowLoading(false);
  };

  const handleFellowDisconnect = async () => {
    setFellowLoading(true);
    try {
      await fetchWithRetry({
        url: `${API_BASE}/api/fellow?action=disconnect`,
        body: {},
        retries: 1,
        serviceName: 'Fellow',
      });
      // Update local profile state (server already wrote to Firestore via Admin SDK)
      await updateProfile({ fellow: { connected: false } }, { localOnly: true });
      haptic.light();
      setToast('Fellow account disconnected');
    } catch (err) {
      setToast('Failed to disconnect, try again');
    }
    setFellowLoading(false);
  };

  // --- Preference handlers (auto-save + toast) ---

  const handleGrinderChange = async (e) => {
    const val = e.target.value;
    try {
      const updates = { grinder: val };
      if (val !== 'other') updates.grinderCustomName = null;
      await updatePreferences(updates);
      haptic.light();
      setToast('Grinder updated');
    } catch (err) {
      console.error('[Settings] Grinder update failed:', err);
      setToast('Failed to save, try again');
    }
  };

  const handleCustomGrinderBlur = async (e) => {
    const val = e.target.value.trim();
    if (val !== (preferences.grinderCustomName || '')) {
      try {
        await updatePreferences({ grinderCustomName: val || null });
        haptic.light();
        setToast('Custom grinder saved');
      } catch (err) {
        console.error('[Settings] Custom grinder update failed:', err);
        setToast('Failed to save, try again');
      }
    }
  };

  const handleBrewMethodChange = async (e) => {
    const val = e.target.value;
    try {
      await updatePreferences({ brewMethod: val });
      haptic.light();
      setToast('Brew method updated');
    } catch (err) {
      console.error('[Settings] Brew method update failed:', err);
      setToast('Failed to save, try again');
    }
  };

  const handleGrindDisplayChange = async (e) => {
    const val = e.target.value;
    try {
      await updatePreferences({ grindSizeDisplay: val });
      haptic.light();
      setToast('Grind display updated');
    } catch (err) {
      console.error('[Settings] Grind display update failed:', err);
      setToast('Failed to save, try again');
    }
  };

  const handleCanisterChange = async (e) => {
    const newCount = Number(e.target.value);
    const currentCount = preferences.canisterCount || 3;

    // Check for active beans in slots that would be removed
    if (newCount < currentCount && beans) {
      const overflowBeans = beans.filter(
        b => b.status === 'ACTIVE' && b.jarSlot > newCount
      );
      if (overflowBeans.length > 0) {
        setCanisterConfirm({ newCount, overflowBeans });
        return;
      }
    }

    try {
      await updatePreferences({ canisterCount: newCount });
      haptic.light();
      setToast(`Jars set to ${newCount}`);
    } catch (err) {
      console.error('[Settings] Jar update failed:', err);
      setToast('Failed to save, try again');
    }
  };

  const handleCanisterConfirm = async () => {
    if (!canisterConfirm) return;
    const { newCount, overflowBeans } = canisterConfirm;
    try {
      const batch = writeBatch(db);
      // Return overflow beans to sealed
      for (const bean of overflowBeans) {
        const beanRef = doc(db, 'users', uid, 'beans', bean.id);
        batch.update(beanRef, {
          status: 'SEALED',
          jarSlot: null,
          atmosSlot: deleteField(),
          openDate: null,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      // Update preferences (single Firestore write + optimistic local update)
      await updatePreferences({ canisterCount: newCount });
      // On native, batch bypasses per-hook refetch for beans
      if (Capacitor.isNativePlatform() && refetchBeans) await refetchBeans();
      haptic.light();
      setToast(`Jars set to ${newCount}`);
    } catch (err) {
      console.error('[Settings] Jar batch update failed:', err);
      setToast('Failed to save, try again');
    }
    setCanisterConfirm(null);
  };

  const handleUsernameEdit = () => {
    setUsernameValue(profile?.username || '');
    setEditingUsername(true);
  };

  const handleDisplayNameEdit = () => {
    setDisplayNameValue(profile?.displayName || '');
    setEditingDisplayName(true);
  };

  const handleDisplayNameSave = async () => {
    const cleaned = sanitizeUserText(displayNameValue);
    if (!cleaned) {
      setToast('Name cannot be empty');
      return;
    }
    try {
      await updateProfile({ displayName: cleaned });
      if (profile?.marketingConsent && uid) {
        const batch = writeBatch(db);
        const emailRef = doc(db, 'emailList', uid);
        batch.set(emailRef, {
          email: profile?.email || '',
          displayName: cleaned,
          source: 'settings',
        }, { merge: true });
        await batch.commit();
      }
      haptic.light();
      setToast('Name saved');
      setEditingDisplayName(false);
    } catch (err) {
      console.error('[Settings] Name update failed:', err);
      setToast('Failed to save, try again');
    }
  };

  const handleUsernameSave = async () => {
    const cleaned = usernameValue.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (cleaned.length > 0 && (cleaned.length < 3 || cleaned.length > 30)) {
      setToast('Username must be 3-30 characters');
      return;
    }
    try {
      await updateProfile({ username: cleaned || null });
      haptic.light();
      setToast(cleaned ? 'Username saved' : 'Username removed');
      setEditingUsername(false);
    } catch (err) {
      console.error('[Settings] Username update failed:', err);
      setToast('Failed to save, try again');
    }
  };

  const handleMarketingToggle = async () => {
    const newVal = !profile?.marketingConsent;
    try {
      const batch = writeBatch(db);
      const profileRef = doc(db, 'users', uid);
      batch.update(profileRef, {
        marketingConsent: newVal,
        marketingConsentDate: serverTimestamp(),
      });
      const emailRef = doc(db, 'emailList', uid);
      if (newVal) {
        batch.set(emailRef, {
          email: profile?.email || '',
          displayName: profile?.displayName || '',
          signUpDate: serverTimestamp(),
          source: 'settings',
        });
      } else {
        batch.delete(emailRef);
      }
      await batch.commit();
      // Optimistic local update
      await updateProfile({
        marketingConsent: newVal,
        marketingConsentDate: new Date(),
      });
      haptic.light();
      setToast(newVal ? 'Email updates enabled' : 'Email updates disabled');
    } catch (err) {
      console.error('[Settings] Marketing toggle failed:', err);
      setToast('Failed to save, try again');
    }
  };

  const handleSignOut = async () => {
    haptic.medium();
    await logOut();
    onClose();
  };

  // Subscription actions
  const handleRestore = async () => {
    if (!isRevenueCatAvailable()) {
      setToast('Subscriptions are managed in the iOS app');
      return;
    }
    haptic.light();
    setRestoring(true);
    try {
      const info = await restorePurchases();
      const { hasPro, hasUltra } = deriveEntitlements(info);
      if (hasPro || hasUltra) {
        setToast('Subscription restored');
      } else {
        setToast('No active subscription found');
      }
    } catch (err) {
      console.error('[Settings] Restore failed:', err);
      setToast('Could not restore purchases. Please try again.');
    }
    setRestoring(false);
  };

  const handleManageSubscription = () => {
    haptic.light();
    // Apple deep link to the user's subscription management page. Works on
    // native (opens iOS Settings > [Apple ID] > Subscriptions) and web
    // (opens the App Store web page).
    window.open('https://apps.apple.com/account/subscriptions', '_blank', 'noopener,noreferrer');
  };

  const handleOpenPaywall = () => {
    haptic.light();
    openPaywall({ feature: 'generic', promote: 'pro' });
  };

  const handleRedeemSubmit = async () => {
    const code = redeemInput.trim().toUpperCase();
    if (!code) {
      setRedeemError(REDEEM_COPY.invalid_input);
      return;
    }
    setRedeemError(null);
    setRedeemLoading(true);
    try {
      const result = await redeemCode(code);
      haptic.light();
      setRedeemSuccess({ expiresAt: result.expiresAt });
      // Firestore listener will flip hasPro true shortly; the row hides
      // once it does. Keep the success panel visible until then so the
      // user sees confirmation.
    } catch (err) {
      const copy = REDEEM_COPY[err?.code] || REDEEM_GENERIC_ERROR;
      setRedeemError(copy);
    } finally {
      setRedeemLoading(false);
    }
  };

  const resetRedeemForm = () => {
    setRedeemOpen(false);
    setRedeemInput('');
    setRedeemError(null);
    setRedeemSuccess(null);
  };

  // Delete Account flow
  const resetDeleteFlow = () => {
    setDeleteStep(null);
    setDeleteInput('');
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') return;
    haptic.medium();
    setDeleteStep('deleting');
    try {
      await reauthenticateForAccountDeletion();
      await auth.currentUser?.getIdToken(true);

      const res = await fetchWithRetry({
        url: `${API_BASE}/api/delete-account`,
        body: { confirmation: 'DELETE' },
        retries: 0,
        timeout: 30000,
        serviceName: 'Delete account',
      });
      if (!res?.ok) throw new Error('Delete failed');
      // Clear local state and sign out. The auth record is gone server-side
      // and refresh tokens have been revoked.
      await logOut();
      onClose();
    } catch (err) {
      console.error('[Settings] Delete account failed:', err);
      if (err?.code === 'reauth_required') {
        setToast('Please confirm your sign-in again to delete your account.');
      } else if (err?.code === 'auth/unsupported-provider') {
        setToast('Please sign out and sign back in, then try deleting again.');
      } else if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request' || err?.message?.toLowerCase().includes('cancel')) {
        setToast('Account deletion canceled. Nothing was deleted.');
      } else {
        setToast('Could not delete account. Please try again or contact support.');
      }
      resetDeleteFlow();
    }
  };

  // Human-readable subscription summary
  const planLabel = plan ? (PLAN_LABELS[plan] || plan) : null;
  const subscriptionStatusLabel = hasPro
    ? (status === 'trial' ? `${planLabel || 'Pro'} (Trial)` : (planLabel || 'Pro'))
    : 'Free';

  if (!open) return null;

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0,
      background: glass.scrim,
      backdropFilter: glass.blur,
      WebkitBackdropFilter: glass.blur,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
    }}>
      <div
        style={{
          background: C.bgDeep,
          borderRadius: `${radius.xl}px ${radius.xl}px 0 0`,
          width: '100%',
          maxWidth: 480,
          maxHeight: '95dvh',
          boxShadow: shadows.modal,
          display: 'flex',
          flexDirection: 'column',
          transition: `transform ${motionTokens.dur.base}s ${motionTokens.cssOut}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Grabber handle */}
        <div style={{
          width: 36, height: 4,
          borderRadius: radius.pill,
          background: C.hairline,
          margin: '10px auto 0',
          flexShrink: 0,
        }} />
        {/* Sticky header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          background: glass.chrome,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
          padding: '8px 20px 14px',
          borderBottom: `0.5px solid ${glass.chromeBorder}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{
            fontFamily: fonts.heading,
            fontSize: typeScale.h2.fontSize,
            fontWeight: typeScale.h2.fontWeight,
            lineHeight: typeScale.h2.lineHeight,
            color: C.text,
            letterSpacing: '-0.01em',
          }}>
            Settings
          </div>
          <button
            onClick={onClose}
            style={{
              background: C.accentSoft,
              border: 'none',
              cursor: 'pointer',
              padding: '6px 16px',
              borderRadius: radius.pill,
              fontFamily: fonts.body,
              fontSize: 15,
              fontWeight: 700,
              color: C.accent,
              minWidth: 44,
              minHeight: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Done
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{
          overflowY: 'auto', flex: 1, minHeight: 0,
          paddingTop: 8,
          paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
        }}>

          {/* --- Profile Section --- */}
          <div style={sectionHeaderStyle}>Profile</div>
          <div style={groupStyle}>
            <div style={{
              padding: '16px 16px 14px',
              background: `linear-gradient(135deg, ${C.accentSoft} 0%, ${C.card} 100%)`,
              borderBottom: `0.5px solid ${C.hairline}`,
            }}>
              <div style={{
                fontFamily: fonts.heading,
                fontSize: typeScale.h3.fontSize,
                fontWeight: 700,
                color: C.text,
                letterSpacing: '-0.01em',
              }}>
                {profile?.displayName || 'Coffee Lover'}
              </div>
              {profile?.email && (
                <div style={{
                  fontFamily: fonts.body,
                  fontSize: 13,
                  color: C.textMuted,
                  marginTop: 3,
                  fontWeight: 500,
                }}>
                  {profile.email}
                </div>
              )}
            </div>
            <div style={separatorStyle} />
            {/* Name row */}
            <div style={rowStyle}>
              <span style={rowLabelStyle}>Name</span>
              {editingDisplayName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="text"
                    value={displayNameValue}
                    onChange={e => setDisplayNameValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleDisplayNameSave()}
                    maxLength={50}
                    placeholder="Your name"
                    autoFocus
                    style={{
                      fontFamily: fonts.body, fontSize: 16, color: C.text,
                      background: C.bgDeep, border: `1px solid ${C.border}`,
                      borderRadius: radius.sm, padding: '8px 12px', width: 150,
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleDisplayNameSave}
                    style={{
                      background: C.accent, color: '#fff', border: 'none',
                      borderRadius: radius.sm, padding: '8px 16px', cursor: 'pointer',
                      fontFamily: fonts.body, fontSize: 14, fontWeight: 700,
                      minHeight: 36,
                    }}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDisplayNameEdit}
                  style={{ ...rowValueStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minHeight: 44 }}
                >
                  <span>{profile?.displayName || 'Set name'}</span>
                  <ChevronRight size={16} color={C.textLight} />
                </button>
              )}
            </div>
            <div style={separatorStyle} />
            {/* Username row */}
            <div style={rowStyle}>
              <span style={rowLabelStyle}>Username</span>
              {editingUsername ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="text"
                    value={usernameValue}
                    onChange={e => setUsernameValue(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && handleUsernameSave()}
                    maxLength={30}
                    placeholder="username"
                    autoFocus
                    style={{
                      fontFamily: fonts.body, fontSize: 16, color: C.text,
                      background: C.bgDeep, border: `1px solid ${C.border}`,
                      borderRadius: radius.sm, padding: '8px 12px', width: 140,
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleUsernameSave}
                    style={{
                      background: C.accent, color: '#fff', border: 'none',
                      borderRadius: radius.sm, padding: '8px 16px', cursor: 'pointer',
                      fontFamily: fonts.body, fontSize: 14, fontWeight: 700,
                      minHeight: 36,
                    }}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleUsernameEdit}
                  style={{ ...rowValueStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <span>{profile?.username ? `@${profile.username}` : 'Set username'}</span>
                  <ChevronRight size={16} color={C.textLight} />
                </button>
              )}
            </div>
          </div>

          {/* --- Equipment Section --- */}
          <div style={{ ...sectionHeaderStyle, paddingTop: 16 }}>Equipment</div>
          <div style={groupStyle}>
            {/* Grinder */}
            <div style={rowStyle}>
              <span style={rowLabelStyle}>Grinder</span>
              <div style={{ ...rowValueStyle, position: 'relative' }}>
                <select
                  value={preferences.grinder}
                  onChange={handleGrinderChange}
                  style={{
                    ...selectStyle,
                    width: grinderSelectWidth != null ? grinderSelectWidth : undefined,
                  }}
                >
                  {GRINDERS.map(g => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
                <span
                  ref={grinderMirrorRef}
                  aria-hidden="true"
                  style={{
                    position: 'absolute', left: -9999, top: 0,
                    visibility: 'hidden', pointerEvents: 'none',
                    whiteSpace: 'pre',
                    fontFamily: fonts.body, fontSize: 16,
                    paddingLeft: 8, paddingRight: 0,
                  }}
                >
                  {grinderLabel}
                </span>
                <ChevronRight size={16} color={C.textLight} />
              </div>
            </div>
            {/* Custom grinder name (only if "other") */}
            {preferences.grinder === 'other' && (
              <>
                <div style={separatorStyle} />
                <div style={{ ...rowStyle, gap: 12 }}>
                  <span style={rowLabelStyle}>Grinder Name</span>
                  <input
                    type="text"
                    defaultValue={preferences.grinderCustomName || ''}
                    onBlur={handleCustomGrinderBlur}
                    onFocus={scrollOnFocus}
                    placeholder="e.g., Comandante C40"
                    style={{
                      fontFamily: fonts.body, fontSize: 16, color: C.text,
                      background: C.bgDeep, border: `1px solid ${C.border}`,
                      borderRadius: radius.sm, padding: '8px 12px', flex: 1,
                      textAlign: 'right', outline: 'none',
                      minWidth: 0,
                    }}
                  />
                </div>
              </>
            )}
            <div style={separatorStyle} />
            {/* Brew Method */}
            <div style={rowStyle}>
              <span style={rowLabelStyle}>Brew Method</span>
              <div style={rowValueStyle}>
                <select
                  value={preferences.brewMethod}
                  onChange={handleBrewMethodChange}
                  style={selectStyle}
                >
                  <option value="aiden">Aiden Brew</option>
                  {BREW_DEVICES.map(d => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
                <ChevronRight size={16} color={C.textLight} />
              </div>
            </div>
            <div style={separatorStyle} />
            {/* Grind Size Display */}
            <div style={rowStyle}>
              <span style={rowLabelStyle}>Grind Size Display</span>
              <div style={rowValueStyle}>
                <select
                  value={preferences.grindSizeDisplay}
                  onChange={handleGrindDisplayChange}
                  style={selectStyle}
                >
                  <option value="default">Grinder Steps</option>
                  <option value="microns">Microns</option>
                </select>
                <ChevronRight size={16} color={C.textLight} />
              </div>
            </div>
            <div style={separatorStyle} />
            {/* Canister Count */}
            <div style={rowStyle}>
              <span style={rowLabelStyle}>Coffee Jars</span>
              <div style={rowValueStyle}>
                <select
                  value={preferences.canisterCount}
                  onChange={handleCanisterChange}
                  style={selectStyle}
                >
                  {CANISTER_OPTIONS.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <ChevronRight size={16} color={C.textLight} />
              </div>
            </div>
          </div>

          {/* --- Fellow Aiden Section --- */}
          {(preferences.brewMethod === 'aiden') && (
            <>
              <div style={{ ...sectionHeaderStyle, paddingTop: 16 }}>Fellow Aiden</div>
              <div style={groupStyle}>
                {fellowConnected && !fellowFormOpen ? (
                  /* Connected state */
                  <div style={rowStyle}>
                    <div>
                      <span style={rowLabelStyle}>Connected as</span>
                      <div style={{ fontSize: 13, color: C.textMuted, marginTop: 3, fontWeight: 500 }}>{fellowEmail}</div>
                    </div>
                    <button
                      onClick={handleFellowDisconnect}
                      disabled={fellowLoading}
                      style={{
                        background: C.redBg,
                        border: `1px solid ${C.red}40`,
                        borderRadius: radius.sm,
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontFamily: fonts.body,
                        fontSize: 14,
                        fontWeight: 700,
                        color: C.red,
                        opacity: fellowLoading ? 0.5 : 1,
                        minHeight: 36,
                      }}
                    >
                      {fellowLoading ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </div>
                ) : fellowFormOpen ? (
                  /* Connect form */
                  <div style={{ padding: 18 }}>
                    <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 14, fontFamily: fonts.body, fontWeight: 500 }}>
                      Enter your Fellow app credentials
                    </div>
                    <input
                      type="text"
                      placeholder="Fellow email"
                      value={fellowEmailInput}
                      onChange={e => setFellowEmailInput(e.target.value)}
                      onFocus={scrollOnFocus}
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: radius.sm,
                        border: `1px solid ${C.border}`, fontFamily: fonts.body,
                        fontSize: 16, background: C.bgDeep, color: C.text,
                        boxSizing: 'border-box', marginBottom: 10, outline: 'none',
                      }}
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={fellowPasswordInput}
                      onChange={e => setFellowPasswordInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !fellowLoading && handleFellowConnect()}
                      onFocus={scrollOnFocus}
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: radius.sm,
                        border: `1px solid ${C.border}`, fontFamily: fonts.body,
                        fontSize: 16, background: C.bgDeep, color: C.text,
                        boxSizing: 'border-box', marginBottom: fellowError ? 10 : 14, outline: 'none',
                      }}
                    />
                    {fellowError && (
                      <div style={{ fontSize: 13, color: C.red, marginBottom: 10, fontFamily: fonts.body }}>
                        {fellowError}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => { setFellowFormOpen(false); setFellowError(null); }}
                        style={{
                          flex: 1, padding: '12px 16px', borderRadius: radius.md,
                          border: `1px solid ${C.border}`, background: C.bgDeep,
                          fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                          color: C.textMuted, cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleFellowConnect}
                        disabled={fellowLoading || !fellowEmailInput.trim() || !fellowPasswordInput}
                        style={{
                          flex: 1, padding: '12px 16px', borderRadius: radius.md,
                          border: 'none', background: C.accent,
                          fontFamily: fonts.body, fontSize: 15, fontWeight: 700,
                          color: '#fff', cursor: 'pointer',
                          opacity: (fellowLoading || !fellowEmailInput.trim() || !fellowPasswordInput) ? 0.5 : 1,
                          boxShadow: shadows.button,
                        }}
                      >
                        {fellowLoading ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Disconnected state */
                  <div style={rowStyle}>
                    <span style={{ ...rowLabelStyle, fontSize: 14, flex: 1, paddingRight: 14, color: C.textMuted }}>
                      Connect your Fellow account for one-tap recipe push
                    </span>
                    <button
                      onClick={() => setFellowFormOpen(true)}
                      style={{
                        background: C.accent,
                        color: '#fff',
                        border: 'none',
                        borderRadius: radius.sm,
                        padding: '10px 18px',
                        cursor: 'pointer',
                        fontFamily: fonts.body,
                        fontSize: 14,
                        fontWeight: 700,
                        flexShrink: 0,
                        boxShadow: shadows.button,
                        minHeight: 40,
                      }}
                    >
                      Connect
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* --- Subscription Section --- */}
          <div style={{ ...sectionHeaderStyle, paddingTop: 16 }}>Subscription</div>
          <div style={groupStyle}>
            {/* Current plan row — premium badge when subscribed */}
            <div style={rowStyle}>
              <span style={rowLabelStyle}>Current Plan</span>
              <span style={{
                ...rowValueStyle,
                fontWeight: 700,
                color: hasPro ? C.accent : C.textMuted,
                background: hasPro ? C.accentSoft : 'transparent',
                borderRadius: radius.pill,
                padding: hasPro ? '3px 12px' : 0,
                fontSize: 14,
              }}>
                {subscriptionStatusLabel}
              </span>
            </div>

            {!hasPro && (
              <>
                <div style={separatorStyle} />
                <button
                  onClick={handleOpenPaywall}
                  style={{
                    ...rowStyle,
                    background: `linear-gradient(135deg, ${C.accentSoft} 0%, ${C.card} 100%)`,
                  }}
                >
                  <span style={{ ...rowLabelStyle, color: C.accent, fontWeight: 700 }}>Upgrade to Pro</span>
                  <ChevronRight size={18} color={C.accent} />
                </button>
              </>
            )}

            {hasPro && (
              <>
                <div style={separatorStyle} />
                <button onClick={handleManageSubscription} style={rowStyle}>
                  <span style={rowLabelStyle}>Manage Subscription</span>
                  <ExternalLink size={16} color={C.textMuted} />
                </button>
              </>
            )}

            {!hasPro && (
              <>
                <div style={separatorStyle} />
                {Capacitor.isNativePlatform() ? (
                  <button
                    onClick={() => {
                      haptic.light();
                      window.open('https://apps.apple.com/redeem?ctx=offercodes&id=6761014463', '_blank');
                    }}
                    style={rowStyle}
                  >
                    <span style={rowLabelStyle}>Redeem Offer Code</span>
                    <ExternalLink size={16} color={C.textMuted} />
                  </button>
                ) : (
                  <>
                    {redeemSuccess ? (
                      <div style={{ padding: 18 }}>
                        <div style={{
                          fontFamily: fonts.body,
                          fontSize: 15,
                          color: C.green,
                          marginBottom: 6,
                          fontWeight: 700,
                        }}>
                          Pro unlocked
                        </div>
                        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14, fontFamily: fonts.body }}>
                          Active until {new Date(redeemSuccess.expiresAt).toLocaleDateString()}
                        </div>
                        <button
                          onClick={resetRedeemForm}
                          style={{
                            padding: '10px 20px', borderRadius: radius.md,
                            border: `1px solid ${C.border}`, background: C.bgDeep,
                            fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                            color: C.textMuted, cursor: 'pointer',
                          }}
                        >
                          Close
                        </button>
                      </div>
                    ) : redeemOpen ? (
                      <div style={{ padding: 18 }}>
                        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12, fontFamily: fonts.body, fontWeight: 500 }}>
                          Enter your redemption code
                        </div>
                        <input
                          type="text"
                          placeholder="CODE"
                          value={redeemInput}
                          onChange={(e) => {
                            const cleaned = e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9-]/g, '')
                              .slice(0, 20);
                            setRedeemInput(cleaned);
                            if (redeemError) setRedeemError(null);
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && !redeemLoading && handleRedeemSubmit()}
                          onFocus={scrollOnFocus}
                          autoCapitalize="characters"
                          autoCorrect="off"
                          spellCheck={false}
                          maxLength={20}
                          style={{
                            width: '100%', padding: '12px 14px', borderRadius: radius.sm,
                            border: `1px solid ${C.border}`, fontFamily: fonts.body,
                            fontSize: 16, background: C.bgDeep, color: C.text,
                            boxSizing: 'border-box',
                            marginBottom: redeemError ? 10 : 14,
                            letterSpacing: 2,
                            textTransform: 'uppercase',
                            outline: 'none',
                          }}
                        />
                        {redeemError && (
                          <div style={{ fontSize: 13, color: C.red, marginBottom: 10, fontFamily: fonts.body }}>
                            {redeemError}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            onClick={resetRedeemForm}
                            style={{
                              flex: 1, padding: '12px 16px', borderRadius: radius.md,
                              border: `1px solid ${C.border}`, background: C.bgDeep,
                              fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                              color: C.textMuted, cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleRedeemSubmit}
                            disabled={redeemLoading || !redeemInput.trim()}
                            style={{
                              flex: 1, padding: '12px 16px', borderRadius: radius.md,
                              border: 'none', background: C.accent,
                              fontFamily: fonts.body, fontSize: 15, fontWeight: 700,
                              color: '#fff', cursor: 'pointer',
                              opacity: (redeemLoading || !redeemInput.trim()) ? 0.5 : 1,
                              boxShadow: shadows.button,
                            }}
                          >
                            {redeemLoading ? 'Redeeming...' : 'Redeem'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { haptic.light(); setRedeemOpen(true); }}
                        style={rowStyle}
                      >
                        <span style={rowLabelStyle}>Redeem Code</span>
                        <ChevronRight size={18} color={C.textMuted} />
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            <div style={separatorStyle} />
            <button
              onClick={handleRestore}
              disabled={restoring}
              style={{ ...rowStyle, opacity: restoring ? 0.5 : 1 }}
            >
              <span style={rowLabelStyle}>Restore Purchases</span>
              <RefreshCw size={16} color={C.textMuted} />
            </button>
          </div>

          {/* --- Legal Section --- */}
          <div style={{ ...sectionHeaderStyle, paddingTop: 16 }}>Legal</div>
          <div style={groupStyle}>
            <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={async () => {
              const newVal = !profile?.aiDataConsent;
              if (!newVal) {
                if (!window.confirm('This will disable all AI features. You can still manage beans and tastings manually. Continue?')) return;
              }
              try {
                await updateProfile({
                  aiDataConsent: newVal,
                  aiConsentDate: serverTimestamp(),
                });
                haptic.light();
                setToast(newVal ? 'AI data sharing enabled' : 'AI data sharing disabled');
              } catch (err) {
                console.error('[Settings] AI consent toggle failed:', err);
                setToast('Failed to save, try again');
              }
            }}>
              <div>
                <span style={rowLabelStyle}>Data & AI</span>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3, fontFamily: fonts.body, fontWeight: 500 }}>
                  {profile?.aiDataConsent ? 'AI features enabled' : 'AI features disabled'}
                </div>
              </div>
              {/* Refined toggle */}
              <div style={{
                width: 51, height: 31, borderRadius: radius.pill,
                background: profile?.aiDataConsent ? C.green : C.cardMuted,
                position: 'relative',
                transition: `background ${motionTokens.dur.fast}s ${motionTokens.cssOut}`,
                flexShrink: 0,
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)',
              }}>
                <div style={{
                  width: 27, height: 27,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.18)',
                  position: 'absolute',
                  top: 2,
                  left: profile?.aiDataConsent ? 22 : 2,
                  transition: `left ${motionTokens.dur.fast}s ${motionTokens.cssOut}`,
                }} />
              </div>
            </div>
            <div style={separatorStyle} />
            <a
              href="https://2manybeans.vercel.app/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...rowStyle, textDecoration: 'none', color: C.text }}
            >
              <span style={rowLabelStyle}>Privacy Policy</span>
              <ExternalLink size={16} color={C.textLight} />
            </a>
            <div style={separatorStyle} />
            <a
              href="https://2manybeans.vercel.app/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...rowStyle, textDecoration: 'none', color: C.text }}
            >
              <span style={rowLabelStyle}>Terms of Service</span>
              <ExternalLink size={16} color={C.textLight} />
            </a>
          </div>

          {/* --- Notifications Section --- */}
          <div style={{ ...sectionHeaderStyle, paddingTop: 16 }}>Notifications</div>
          <div style={groupStyle}>
            <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={handleMarketingToggle}>
              <span style={rowLabelStyle}>Email updates</span>
              {/* Refined toggle */}
              <div style={{
                width: 51, height: 31, borderRadius: radius.pill,
                background: profile?.marketingConsent ? C.green : C.cardMuted,
                position: 'relative',
                transition: `background ${motionTokens.dur.fast}s ${motionTokens.cssOut}`,
                flexShrink: 0,
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)',
              }}>
                <div style={{
                  width: 27, height: 27,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.18)',
                  position: 'absolute',
                  top: 2,
                  left: profile?.marketingConsent ? 22 : 2,
                  transition: `left ${motionTokens.dur.fast}s ${motionTokens.cssOut}`,
                }} />
              </div>
            </div>
          </div>

          {/* --- Dev Section (DEV-only, tree-shaken from prod) ---
              Replay is LOCAL-ONLY now. It sets a localStorage flag that
              Gate 5 in main.jsx reads and clears the uid-scoped state
              blob. It does NOT mutate Firestore — a prior version did,
              which caused the "dev replay strands user in prod" bug. */}
          {import.meta.env.DEV && (
            <>
              <div style={{ ...sectionHeaderStyle, paddingTop: 16 }}>Dev</div>
              <div style={groupStyle}>
                <button
                  style={{ ...rowStyle, color: C.accent, fontWeight: 600 }}
                  onClick={async () => {
                    try {
                      const mod = await import('../components/onboarding/onboardingState');
                      mod.setDevForceOnboarding?.(true);
                      mod.clearState?.(uid);
                      window.location.reload();
                    } catch (err) {
                      console.error('[Dev] Replay onboarding failed', err);
                    }
                  }}
                >
                  <span style={rowLabelStyle}>Replay onboarding</span>
                </button>
              </div>
            </>
          )}

          {/* --- App Version --- */}
          <div style={{
            textAlign: 'center',
            fontFamily: fonts.body,
            fontSize: 11,
            fontWeight: 600,
            color: C.textLight,
            letterSpacing: '0.04em',
            marginTop: 16,
            marginBottom: 8,
          }}>
            v{__APP_VERSION__}{otaBundle ? ` · OTA ${otaBundle}` : ''}
          </div>

          {/* --- Account Section --- */}
          <div style={{ ...sectionHeaderStyle, paddingTop: 8 }}>Account</div>
          <div style={groupStyle}>
            <button
              onClick={handleSignOut}
              style={{
                ...rowStyle,
                justifyContent: 'center',
                color: C.red,
                fontWeight: 700,
                gap: 8,
              }}
            >
              <LogOut size={18} color={C.red} />
              Sign Out
            </button>
            <div style={separatorStyle} />
            <button
              onClick={() => setDeleteStep('warn')}
              style={{
                ...rowStyle,
                justifyContent: 'center',
                color: C.red,
                fontWeight: 700,
                gap: 8,
                opacity: 0.75,
              }}
            >
              <Trash2 size={17} color={C.red} />
              Delete Account
            </button>
          </div>

        </div>
      </div>
      <Toast message={toast} open={!!toast} onClose={() => setToast(null)} />

      {/* Delete Account: step 1 (warning) and step 2 (type DELETE) */}
      {deleteStep && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: glass.scrim,
            backdropFilter: glass.blur,
            WebkitBackdropFilter: glass.blur,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => {
            if (deleteStep !== 'deleting') resetDeleteFlow();
          }}
        >
          <div
            style={{
              background: C.card,
              borderRadius: radius.xl,
              padding: 24,
              maxWidth: 360, width: '100%',
              boxShadow: shadows.e3,
              border: `1px solid ${C.hairline}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {deleteStep === 'warn' && (
              <>
                <div style={{
                  fontFamily: fonts.heading,
                  fontSize: typeScale.h2.fontSize,
                  fontWeight: typeScale.h2.fontWeight,
                  color: C.text,
                  marginBottom: 12,
                  letterSpacing: '-0.01em',
                }}>
                  Delete your account?
                </div>
                <div style={{ fontFamily: fonts.body, fontSize: 14, color: C.textMuted, lineHeight: 1.6, marginBottom: 16, fontWeight: 500 }}>
                  This will permanently delete your account and all your data:
                  <ul style={{ paddingLeft: 18, marginTop: 8, color: C.text }}>
                    <li>All beans, tastings, and photos</li>
                    <li>Your preferences and profile</li>
                    <li>Your Fellow Aiden connection</li>
                  </ul>
                  This cannot be undone.
                </div>
                {hasPro && (
                  <div
                    style={{
                      background: C.amberBg,
                      border: `1px solid ${C.amber}50`,
                      borderRadius: radius.md,
                      padding: 14,
                      fontSize: 13,
                      color: C.text,
                      lineHeight: 1.6,
                      marginBottom: 16,
                      fontFamily: fonts.body,
                    }}
                  >
                    <strong>You have an active subscription.</strong> Deleting your account does NOT cancel
                    your Apple subscription. Cancel it first in{' '}
                    <a
                      href="https://apps.apple.com/account/subscriptions"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: C.accent, fontWeight: 700 }}
                    >
                      iOS Settings
                    </a>
                    {' '}or you'll keep getting billed.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={resetDeleteFlow}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: radius.md,
                      border: `1px solid ${C.border}`, background: C.bgDeep,
                      fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                      color: C.textMuted, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setDeleteStep('confirm')}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: radius.md,
                      border: 'none', background: C.red,
                      fontFamily: fonts.body, fontSize: 15, fontWeight: 700,
                      color: '#fff', cursor: 'pointer',
                      boxShadow: `0 2px 8px ${C.red}40`,
                    }}
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {deleteStep === 'confirm' && (
              <>
                <div style={{
                  fontFamily: fonts.heading,
                  fontSize: typeScale.h2.fontSize,
                  fontWeight: typeScale.h2.fontWeight,
                  color: C.text,
                  marginBottom: 12,
                  letterSpacing: '-0.01em',
                }}>
                  Confirm deletion
                </div>
                <div style={{ fontFamily: fonts.body, fontSize: 14, color: C.textMuted, lineHeight: 1.6, marginBottom: 16, fontWeight: 500 }}>
                  Type <strong style={{ color: C.red }}>DELETE</strong> to permanently remove your account and all data.
                </div>
                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck="false"
                  onFocus={scrollOnFocus}
                  style={{
                    width: '100%', padding: '12px 14px',
                    borderRadius: radius.md,
                    border: `1px solid ${deleteInput === 'DELETE' ? C.red : C.border}`,
                    fontFamily: fonts.body, fontSize: 16,
                    marginBottom: 16, background: C.bgDeep, color: C.text,
                    outline: 'none', boxSizing: 'border-box',
                    letterSpacing: 2,
                    transition: `border-color ${motionTokens.dur.fast}s ${motionTokens.cssOut}`,
                  }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={resetDeleteFlow}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: radius.md,
                      border: `1px solid ${C.border}`, background: C.bgDeep,
                      fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                      color: C.textMuted, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteInput !== 'DELETE'}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: radius.md,
                      border: 'none',
                      background: deleteInput === 'DELETE' ? C.red : C.cardMuted,
                      fontFamily: fonts.body, fontSize: 15, fontWeight: 700,
                      color: deleteInput === 'DELETE' ? '#fff' : C.textMuted,
                      cursor: deleteInput === 'DELETE' ? 'pointer' : 'not-allowed',
                      transition: `background ${motionTokens.dur.fast}s ${motionTokens.cssOut}`,
                    }}
                  >
                    Delete Account
                  </button>
                </div>
              </>
            )}

            {deleteStep === 'deleting' && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{
                  fontFamily: fonts.heading,
                  fontSize: typeScale.h3.fontSize,
                  fontWeight: 700,
                  color: C.text,
                  marginBottom: 12,
                }}>
                  Deleting your account...
                </div>
                <div style={{ fontFamily: fonts.body, fontSize: 14, color: C.textMuted, fontWeight: 500 }}>
                  This may take a few seconds. Please don't close the app.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Canister decrease confirmation */}
      {canisterConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: glass.scrim,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }} onClick={() => setCanisterConfirm(null)}>
          <div style={{
            background: C.card,
            borderRadius: radius.xl,
            padding: 24,
            maxWidth: 340, width: '100%',
            boxShadow: shadows.e3,
            border: `1px solid ${C.hairline}`,
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              fontFamily: fonts.heading,
              fontSize: typeScale.h3.fontSize,
              fontWeight: 700,
              color: C.text,
              marginBottom: 12,
              letterSpacing: '-0.01em',
            }}>
              Reduce jars?
            </div>
            <div style={{
              fontFamily: fonts.body,
              fontSize: 14,
              color: C.textMuted,
              lineHeight: 1.6,
              marginBottom: 20,
              fontWeight: 500,
            }}>
              {canisterConfirm.overflowBeans.length === 1
                ? `"${canisterConfirm.overflowBeans[0].name}" is in Jar #${canisterConfirm.overflowBeans[0].jarSlot}. It will be returned to your sealed inventory.`
                : `${canisterConfirm.overflowBeans.length} beans are in jars that will be removed. They will be returned to your sealed inventory.`
              }
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setCanisterConfirm(null)}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: radius.md,
                  border: `1px solid ${C.border}`, background: C.bgDeep,
                  fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                  color: C.textMuted, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCanisterConfirm}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: radius.md,
                  border: 'none', background: C.accent,
                  fontFamily: fonts.body, fontSize: 15, fontWeight: 700,
                  color: '#fff', cursor: 'pointer',
                  boxShadow: shadows.button,
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
