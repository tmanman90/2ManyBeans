// Settings page — iOS grouped table style, full-screen page sheet modal
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { C, fonts, shadows } from '../styles/theme';
import { haptic } from '../lib/haptics';
import { Toast } from './Toast';
import { usePreferences } from '../hooks/useUserProfile';
import { useAuthContext } from '../contexts/AuthContext';
import { db } from '../firebase';

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
};

const rowValueStyle = {
  color: C.textMuted,
  fontSize: 16,
  fontFamily: fonts.body,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const selectStyle = {
  fontFamily: fonts.body, fontSize: 16, color: C.textMuted,
  background: 'transparent', border: 'none',
  appearance: 'none', WebkitAppearance: 'none',
  cursor: 'pointer', textAlign: 'right',
  paddingRight: 4,
};

export const SettingsPage = ({ open, onClose, profile, updateProfile, uid, beans, refetchBeans }) => {
  const { preferences, updatePreferences } = usePreferences();
  const { logOut } = useAuthContext();

  const [toast, setToast] = useState(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState('');
  const [canisterConfirm, setCanisterConfirm] = useState(null); // { newCount, overflowBeans }

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
        b => b.status === 'ACTIVE' && b.atmosSlot > newCount
      );
      if (overflowBeans.length > 0) {
        setCanisterConfirm({ newCount, overflowBeans });
        return;
      }
    }

    try {
      await updatePreferences({ canisterCount: newCount });
      haptic.light();
      setToast(`Canisters set to ${newCount}`);
    } catch (err) {
      console.error('[Settings] Canister update failed:', err);
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
          atmosSlot: null,
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
      setToast(`Canisters set to ${newCount}`);
    } catch (err) {
      console.error('[Settings] Canister batch update failed:', err);
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
              <span style={rowLabelStyle}>Coffee Canisters</span>
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
          </div>

        </div>
      </div>
      <Toast message={toast} open={!!toast} onClose={() => setToast(null)} />

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
              Reduce canisters?
            </div>
            <div style={{ fontFamily: fonts.body, fontSize: 14, color: C.text, lineHeight: 1.5, marginBottom: 16 }}>
              {canisterConfirm.overflowBeans.length === 1
                ? `"${canisterConfirm.overflowBeans[0].name}" is in Atmos #${canisterConfirm.overflowBeans[0].atmosSlot}. It will be returned to your sealed inventory.`
                : `${canisterConfirm.overflowBeans.length} beans are in canisters that will be removed. They will be returned to your sealed inventory.`
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
