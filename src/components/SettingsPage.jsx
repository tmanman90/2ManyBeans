// Settings page — iOS grouped table style, full-screen page sheet modal
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, LogOut, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { doc, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { C, fonts, shadows } from '../styles/theme';
import { haptic } from '../lib/haptics';
import { Toast } from './Toast';
import { usePreferences } from '../hooks/useUserProfile';
import { useAuthContext } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { restorePurchases, isRevenueCatAvailable } from '../lib/revenuecat';
import { PLAN_LABELS } from '../lib/subscriptionConfig';
import { auth } from '../firebase';
import { db } from '../firebase';
import { fetchWithRetry } from '../lib/fetchWithRetry';
import { API_BASE } from '../lib/apiBase';
import { scrollOnFocus } from '../lib/formHelpers';

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
  background: '#FFFFFF',
  borderRadius: 10,
  margin: '0 16px 16px',
  overflow: 'hidden',
};

const sectionHeaderStyle = {
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: C.textMuted,
  fontFamily: fonts.body,
  fontWeight: 600,
  padding: '24px 16px 8px',
  margin: '0 16px',
};

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: 44,
  padding: '10px 16px',
  background: 'transparent',
  border: 'none',
  width: '100%',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  fontFamily: fonts.body,
  fontSize: 16,
};

const separatorStyle = {
  borderBottom: `0.5px solid ${C.borderLight}`,
  marginLeft: 16,
};

const rowLabelStyle = {
  color: C.text,
  fontSize: 16,
  fontFamily: fonts.body,
  flex: 1,
  minWidth: 0,
};

const rowValueStyle = {
  color: C.textMuted,
  fontSize: 16,
  fontFamily: fonts.body,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
};

const selectStyle = {
  fontFamily: fonts.body, fontSize: 16, color: C.textMuted,
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
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState('');
  const [canisterConfirm, setCanisterConfirm] = useState(null); // { newCount, overflowBeans }
  const [restoring, setRestoring] = useState(false);
  // Delete Account flow: 'warn' → user reads consequences, 'confirm' → types
  // DELETE, 'deleting' → API in flight. null = modal closed.
  const [deleteStep, setDeleteStep] = useState(null);
  const [deleteInput, setDeleteInput] = useState('');

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
      const active = info?.entitlements?.active || {};
      if (active.pro || active.ultra) {
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
    window.open('https://apps.apple.com/account/subscriptions', '_blank');
  };

  const handleOpenPaywall = () => {
    haptic.light();
    openPaywall({ feature: 'generic', promote: 'pro' });
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
      // Force-refresh the Firebase ID token so the server's reauth check
      // (auth_time within 5 minutes) sees a fresh timestamp. Without this,
      // the cached token from sign-in 30+ minutes ago would be rejected as
      // 'reauth_required'.
      //
      // NOTE: this only refreshes the token, it does NOT trigger a fresh
      // OAuth reauth. For full security parity with banking-grade flows,
      // we should call reauthenticateWithCredential first. For V1 we accept
      // that the 1-hour token lifetime is the worst-case replay window —
      // the auth_time check still rejects tokens from prior sessions.
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
      // The server returns 401 reauth_required when the token's auth_time
      // is too old. Surface a clearer message in that case.
      if (err?.message?.includes('reauth_required') || err?.message?.toLowerCase().includes('re-sign')) {
        setToast('Please sign out and sign back in, then try again.');
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
      background: 'rgba(44,24,16,0.4)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
    }}>
      <div
        style={{
          background: C.bg,
          borderRadius: '12px 12px 0 0',
          width: '100%',
          maxWidth: 480,
          maxHeight: '95dvh',
          boxShadow: shadows.modal,
          display: 'flex',
          flexDirection: 'column',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          background: C.bg,
          padding: `calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px`,
          borderBottom: `0.5px solid ${C.borderLight}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          borderRadius: '12px 12px 0 0',
        }}>
          <div style={{ fontFamily: fonts.heading, fontSize: 20, fontWeight: 600, color: C.text }}>Settings</div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 8,
              fontFamily: fonts.body, fontSize: 17, fontWeight: 600,
              color: C.accent,
              minWidth: 44, minHeight: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Done
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{
          overflowY: 'auto', flex: 1, minHeight: 0,
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        }}>

          {/* --- Profile Section --- */}
          <div style={sectionHeaderStyle}>Profile</div>
          <div style={groupStyle}>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontFamily: fonts.body, fontSize: 17, fontWeight: 600, color: C.text }}>
                {profile?.displayName || 'Coffee Lover'}
              </div>
              {profile?.email && (
                <div style={{ fontFamily: fonts.body, fontSize: 14, color: C.textMuted, marginTop: 2 }}>
                  {profile.email}
                </div>
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
                      background: C.bg, border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: '6px 10px', width: 140,
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleUsernameSave}
                    style={{
                      background: C.accent, color: '#fff', border: 'none',
                      borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                      fontFamily: fonts.body, fontSize: 14, fontWeight: 600,
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
          <div style={sectionHeaderStyle}>Equipment</div>
          <div style={groupStyle}>
            {/* Grinder */}
            <div style={rowStyle}>
              <span style={rowLabelStyle}>Grinder</span>
              <div style={rowValueStyle}>
                <select
                  value={preferences.grinder}
                  onChange={handleGrinderChange}
                  style={selectStyle}
                >
                  {GRINDERS.map(g => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
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
                      background: C.bg, border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: '6px 10px', flex: 1,
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
                  <option value="handbrew">Hand Brew</option>
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
          {preferences.brewMethod === 'aiden' && (
            <>
              <div style={sectionHeaderStyle}>Fellow Aiden</div>
              <div style={groupStyle}>
                {fellowConnected && !fellowFormOpen ? (
                  /* Connected state */
                  <div style={rowStyle}>
                    <div>
                      <span style={rowLabelStyle}>Connected as</span>
                      <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>{fellowEmail}</div>
                    </div>
                    <button
                      onClick={handleFellowDisconnect}
                      disabled={fellowLoading}
                      style={{
                        background: 'none', border: `1px solid ${C.red}30`,
                        borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                        fontFamily: fonts.body, fontSize: 14, fontWeight: 600,
                        color: C.red, opacity: fellowLoading ? 0.5 : 1,
                      }}
                    >
                      {fellowLoading ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </div>
                ) : fellowFormOpen ? (
                  /* Connect form */
                  <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 14, color: C.text, marginBottom: 12 }}>
                      Enter your Fellow app credentials
                    </div>
                    <input
                      type="text"
                      placeholder="Fellow email"
                      value={fellowEmailInput}
                      onChange={e => setFellowEmailInput(e.target.value)}
                      onFocus={scrollOnFocus}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 8,
                        border: `1px solid ${C.border}`, fontFamily: fonts.body,
                        fontSize: 16, background: C.bg, color: C.text,
                        boxSizing: 'border-box', marginBottom: 8,
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
                        width: '100%', padding: '10px 12px', borderRadius: 8,
                        border: `1px solid ${C.border}`, fontFamily: fonts.body,
                        fontSize: 16, background: C.bg, color: C.text,
                        boxSizing: 'border-box', marginBottom: fellowError ? 8 : 12,
                      }}
                    />
                    {fellowError && (
                      <div style={{ fontSize: 13, color: C.red, marginBottom: 8 }}>
                        {fellowError}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setFellowFormOpen(false); setFellowError(null); }}
                        style={{
                          flex: 1, padding: '10px 16px', borderRadius: 10,
                          border: `1px solid ${C.border}`, background: C.bg,
                          fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                          color: C.text, cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleFellowConnect}
                        disabled={fellowLoading || !fellowEmailInput.trim() || !fellowPasswordInput}
                        style={{
                          flex: 1, padding: '10px 16px', borderRadius: 10,
                          border: 'none', background: C.accent,
                          fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                          color: '#fff', cursor: 'pointer',
                          opacity: (fellowLoading || !fellowEmailInput.trim() || !fellowPasswordInput) ? 0.5 : 1,
                        }}
                      >
                        {fellowLoading ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Disconnected state */
                  <div style={rowStyle}>
                    <span style={{ ...rowLabelStyle, fontSize: 14, flex: 1, paddingRight: 12 }}>
                      Connect your Fellow account for one-tap recipe push
                    </span>
                    <button
                      onClick={() => setFellowFormOpen(true)}
                      style={{
                        background: C.accent, color: '#fff', border: 'none',
                        borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
                        fontFamily: fonts.body, fontSize: 14, fontWeight: 600,
                        flexShrink: 0,
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
          <div style={sectionHeaderStyle}>Subscription</div>
          <div style={groupStyle}>
            <div style={rowStyle}>
              <span style={rowLabelStyle}>Current Plan</span>
              <span style={rowValueStyle}>{subscriptionStatusLabel}</span>
            </div>

            {!hasPro && (
              <>
                <div style={separatorStyle} />
                <button
                  onClick={handleOpenPaywall}
                  style={{ ...rowStyle, color: C.accent, fontWeight: 600 }}
                >
                  <span style={{ ...rowLabelStyle, color: C.accent }}>Upgrade to Pro</span>
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
          <div style={sectionHeaderStyle}>Legal</div>
          <div style={groupStyle}>
            <a
              href="https://2manybeans.vercel.app/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...rowStyle, textDecoration: 'none', color: C.text }}
            >
              <span style={rowLabelStyle}>Privacy Policy</span>
              <ExternalLink size={16} color={C.textMuted} />
            </a>
            <div style={separatorStyle} />
            <a
              href="https://2manybeans.vercel.app/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...rowStyle, textDecoration: 'none', color: C.text }}
            >
              <span style={rowLabelStyle}>Terms of Service</span>
              <ExternalLink size={16} color={C.textMuted} />
            </a>
          </div>

          {/* --- Notifications Section --- */}
          <div style={sectionHeaderStyle}>Notifications</div>
          <div style={groupStyle}>
            <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={handleMarketingToggle}>
              <span style={rowLabelStyle}>Email updates</span>
              <div style={{
                width: 51, height: 31, borderRadius: 16,
                background: profile?.marketingConsent ? C.green : C.borderLight,
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}>
                <div style={{
                  width: 27, height: 27,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                  position: 'absolute',
                  top: 2,
                  left: profile?.marketingConsent ? 22 : 2,
                  transition: 'left 0.2s',
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
              <div style={sectionHeaderStyle}>Dev</div>
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

          {/* --- Account Section --- */}
          <div style={sectionHeaderStyle}>Account</div>
          <div style={groupStyle}>
            <button
              onClick={handleSignOut}
              style={{
                ...rowStyle,
                justifyContent: 'center',
                color: C.red,
                fontWeight: 600,
              }}
            >
              <LogOut size={18} color={C.red} style={{ marginRight: 8 }} />
              Sign Out
            </button>
            <div style={separatorStyle} />
            <button
              onClick={() => setDeleteStep('warn')}
              style={{
                ...rowStyle,
                justifyContent: 'center',
                color: C.red,
                fontWeight: 600,
              }}
            >
              <Trash2 size={18} color={C.red} style={{ marginRight: 8 }} />
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
            background: 'rgba(44,24,16,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => {
            if (deleteStep !== 'deleting') resetDeleteFlow();
          }}
        >
          <div
            style={{
              background: C.bg, borderRadius: 16, padding: 24,
              maxWidth: 360, width: '100%',
              boxShadow: shadows.modal,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {deleteStep === 'warn' && (
              <>
                <div style={{ fontFamily: fonts.heading, fontSize: 20, color: C.text, marginBottom: 12 }}>
                  Delete your account?
                </div>
                <div style={{ fontFamily: fonts.body, fontSize: 14, color: C.text, lineHeight: 1.5, marginBottom: 16 }}>
                  This will permanently delete your account and all your data:
                  <ul style={{ paddingLeft: 18, marginTop: 8 }}>
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
                      border: `1px solid ${C.amber}`,
                      borderRadius: 10,
                      padding: 12,
                      fontSize: 13,
                      color: C.text,
                      lineHeight: 1.5,
                      marginBottom: 16,
                    }}
                  >
                    <strong>You have an active subscription.</strong> Deleting your account does NOT cancel
                    your Apple subscription. Cancel it first in{' '}
                    <a
                      href="https://apps.apple.com/account/subscriptions"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: C.accent, fontWeight: 600 }}
                    >
                      iOS Settings
                    </a>
                    {' '}or you'll keep getting billed.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={resetDeleteFlow}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 10,
                      border: `1px solid ${C.border}`, background: C.bg,
                      fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                      color: C.text, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setDeleteStep('confirm')}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 10,
                      border: 'none', background: C.red,
                      fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                      color: '#fff', cursor: 'pointer',
                    }}
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {deleteStep === 'confirm' && (
              <>
                <div style={{ fontFamily: fonts.heading, fontSize: 20, color: C.text, marginBottom: 12 }}>
                  Confirm deletion
                </div>
                <div style={{ fontFamily: fonts.body, fontSize: 14, color: C.text, lineHeight: 1.5, marginBottom: 16 }}>
                  Type <strong>DELETE</strong> to permanently remove your account and all data.
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
                    borderRadius: 10, border: `1px solid ${C.border}`,
                    fontFamily: fonts.body, fontSize: 16,
                    marginBottom: 16, background: '#fff', color: C.text,
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={resetDeleteFlow}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 10,
                      border: `1px solid ${C.border}`, background: C.bg,
                      fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                      color: C.text, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteInput !== 'DELETE'}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 10,
                      border: 'none',
                      background: deleteInput === 'DELETE' ? C.red : C.borderLight,
                      fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                      color: deleteInput === 'DELETE' ? '#fff' : C.textMuted,
                      cursor: deleteInput === 'DELETE' ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Delete Account
                  </button>
                </div>
              </>
            )}

            {deleteStep === 'deleting' && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontFamily: fonts.heading, fontSize: 18, color: C.text, marginBottom: 12 }}>
                  Deleting your account...
                </div>
                <div style={{ fontFamily: fonts.body, fontSize: 14, color: C.textMuted }}>
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
          background: 'rgba(44,24,16,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }} onClick={() => setCanisterConfirm(null)}>
          <div style={{
            background: C.bg, borderRadius: 16, padding: 24,
            maxWidth: 340, width: '100%',
            boxShadow: shadows.modal,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: fonts.heading, fontSize: 18, color: C.text, marginBottom: 12 }}>
              Reduce jars?
            </div>
            <div style={{ fontFamily: fonts.body, fontSize: 14, color: C.text, lineHeight: 1.5, marginBottom: 16 }}>
              {canisterConfirm.overflowBeans.length === 1
                ? `"${canisterConfirm.overflowBeans[0].name}" is in Jar #${canisterConfirm.overflowBeans[0].jarSlot}. It will be returned to your sealed inventory.`
                : `${canisterConfirm.overflowBeans.length} beans are in jars that will be removed. They will be returned to your sealed inventory.`
              }
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setCanisterConfirm(null)}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 10,
                  border: `1px solid ${C.border}`, background: C.bg,
                  fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                  color: C.text, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCanisterConfirm}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 10,
                  border: 'none', background: C.accent,
                  fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
                  color: '#fff', cursor: 'pointer',
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
