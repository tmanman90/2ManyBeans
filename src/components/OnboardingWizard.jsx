import { useState } from 'react';
import { C, fonts, radius, shadows, cardBase } from '../styles/theme';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const GRINDERS = [
  { key: 'fellow-ode-gen2', label: 'Fellow Ode Gen 2' },
  { key: 'fellow-opus', label: 'Fellow Opus' },
  { key: 'baratza-encore-esp', label: 'Baratza Encore ESP' },
  { key: 'comandante-c40', label: 'Comandante C40 MK4' },
  { key: '1zpresso-jx-pro', label: '1Zpresso JX-Pro' },
  { key: 'baratza-virtuoso-plus', label: 'Baratza Virtuoso+' },
  { key: 'other', label: 'Other' },
];

const OnboardingWizard = ({ user, profile, createProfile, updateProfile }) => {
  const [name, setName] = useState(user?.displayName || '');
  const [grinder, setGrinder] = useState(profile?.preferences?.grinder || 'fellow-ode-gen2');
  const [grinderCustomName, setGrinderCustomName] = useState('');
  const [brewMethod, setBrew] = useState(profile?.preferences?.brewMethod || 'aiden');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const needsName = !user?.displayName;

  const handleSubmit = async () => {
    if (needsName && !name.trim()) return;
    setSubmitting(true);
    try {
      const preferences = {
        grinder,
        grinderCustomName: grinder === 'other' ? grinderCustomName : null,
        brewMethod,
        grindSizeDisplay: 'default',
        canisterCount: 3,
      };

      if (profile) {
        // Profile exists but onboarding not complete (partial completion case)
        await updateProfile({
          preferences,
          onboardingComplete: true,
          marketingConsent,
          marketingConsentDate: marketingConsent ? serverTimestamp() : null,
          ...(needsName && name.trim() ? { displayName: name.trim() } : {}),
        });
      } else {
        // Brand new profile
        await createProfile({
          displayName: name.trim() || user.displayName || '',
          email: user.email || null,
          photoURL: user.photoURL || null,
          signUpProvider: user.providerData?.[0]?.providerId || 'unknown',
          onboardingComplete: true,
          marketingConsent,
          preferences,
        });
      }

      // Manage emailList doc based on consent
      const emailListRef = doc(db, 'emailList', user.uid);
      if (marketingConsent && user.email) {
        await setDoc(emailListRef, {
          email: user.email,
          displayName: name.trim() || user.displayName || '',
          signUpDate: serverTimestamp(),
          source: 'onboarding',
        });
      }

      // Clear any stashed Apple name
      try { localStorage.removeItem('apple_pending_name'); } catch {}
    } catch (err) {
      console.error('[Onboarding] Error:', err);
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      fontFamily: fonts.body,
      background: C.bg,
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: `calc(env(safe-area-inset-top, 0px) + 24px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)`,
      overflowY: 'auto',
    }}>
      {/* Hero */}
      <img
        src="/images/onboarding-welcome.png"
        alt="Welcome"
        style={{ width: 200, height: 200, objectFit: 'cover', borderRadius: 20, marginBottom: 16 }}
      />
      <div style={{ fontFamily: fonts.title, fontSize: 36, color: C.accent, marginBottom: 4, textAlign: 'center' }}>
        {needsName ? 'Welcome to 2manybeans!' : `Welcome, ${user.displayName?.split(' ')[0]}!`}
      </div>
      <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 28, textAlign: 'center' }}>
        Let's set up your brewing profile
      </div>

      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Name field (only if Apple didn't provide one) */}
        {needsName && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, marginBottom: 6, display: 'block' }}>
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 16,
                fontFamily: fonts.body,
                borderRadius: radius.md,
                border: `1px solid ${C.border}`,
                background: C.card,
                color: C.text,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Grinder selection */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, marginBottom: 6, display: 'block' }}>
            What's your grinder?
          </label>
          <select
            value={grinder}
            onChange={e => setGrinder(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: 16,
              fontFamily: fonts.body,
              borderRadius: radius.md,
              border: `1px solid ${C.border}`,
              background: C.card,
              color: C.text,
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238B7B6F' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 14px center',
              boxSizing: 'border-box',
            }}
          >
            {GRINDERS.map(g => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
          {grinder === 'other' && (
            <input
              type="text"
              value={grinderCustomName}
              onChange={e => setGrinderCustomName(e.target.value)}
              placeholder="Your grinder name"
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 16,
                fontFamily: fonts.body,
                borderRadius: radius.md,
                border: `1px solid ${C.border}`,
                background: C.card,
                color: C.text,
                outline: 'none',
                marginTop: 8,
                boxSizing: 'border-box',
              }}
            />
          )}
        </div>

        {/* Brew method */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, marginBottom: 10, display: 'block' }}>
            How do you brew?
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { key: 'aiden', label: 'Fellow Aiden', img: '/images/brew-aiden.png' },
              { key: 'handbrew', label: 'Hand Brew', img: '/images/brew-handbrew.png' },
            ].map(method => (
              <button
                key={method.key}
                onClick={() => setBrew(method.key)}
                style={{
                  flex: 1,
                  ...cardBase,
                  padding: 12,
                  cursor: 'pointer',
                  textAlign: 'center',
                  border: brewMethod === method.key
                    ? `2px solid ${C.accent}`
                    : `1px solid ${C.borderLight}`,
                  background: brewMethod === method.key ? C.amberBg : C.card,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <img
                  src={method.img}
                  alt={method.label}
                  style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 12, marginBottom: 8 }}
                />
                <div style={{
                  fontFamily: fonts.body,
                  fontSize: 13,
                  fontWeight: 600,
                  color: brewMethod === method.key ? C.accent : C.text,
                }}>
                  {method.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Marketing consent */}
        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 28,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}>
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={e => setMarketingConsent(e.target.checked)}
            style={{ marginTop: 2, width: 18, height: 18, accentColor: C.accent }}
          />
          <span style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.4 }}>
            Get brewing tips, new features, and coffee recs by email
          </span>
        </label>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || (needsName && !name.trim())}
          style={{
            width: '100%',
            padding: '14px 24px',
            fontSize: 17,
            fontWeight: 700,
            fontFamily: fonts.body,
            background: C.accent,
            color: '#fff',
            border: 'none',
            borderRadius: radius.md,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: (submitting || (needsName && !name.trim())) ? 0.6 : 1,
            boxShadow: shadows.button,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {submitting ? 'Setting up...' : 'Get Started'}
        </button>
      </div>
    </div>
  );
};

export default OnboardingWizard;
