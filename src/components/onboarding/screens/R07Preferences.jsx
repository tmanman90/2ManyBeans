import { useEffect, useState } from 'react';
import { C, fonts, type as t, radius, shadows, cardBase } from '../../../styles/theme';
import { m, fadeUp, listContainer, listItem, spring } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { warmPaywallOfferings } from '../warmPaywallOfferings';
import { sanitizeUserText } from '../../../lib/sanitizeUserText';
import { scrollOnFocus } from '../../../lib/formHelpers';
import { useNativeKeyboard } from '../../../hooks/useNativeKeyboard';
import { readPendingProviderDisplayName } from '../../../hooks/useUserProfile';
import { ESPRESSO_BASKETS, ESPRESSO_GRINDERS, ESPRESSO_MACHINES, changesEspressoEquipmentIdentity } from '../../../lib/brewMethods';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

const GRINDERS = [
  { key: 'fellow-ode-gen2', label: 'Fellow Ode Gen 2' },
  { key: 'fellow-opus', label: 'Fellow Opus' },
  { key: 'baratza-encore-esp', label: 'Baratza Encore ESP' },
  { key: 'comandante-c40', label: 'Comandante C40 MK4' },
  { key: '1zpresso-jx-pro', label: '1Zpresso JX-Pro' },
  { key: 'baratza-virtuoso-plus', label: 'Baratza Virtuoso+' },
  { key: 'other', label: 'Other / Manual Entry' },
];

const BREW_OPTIONS = [
  { key: 'aiden', label: 'Fellow Aiden' },
  { key: 'v60', label: 'Hario V60' },
  { key: 'kalita', label: 'Kalita Wave' },
  { key: 'chemex', label: 'Chemex' },
  { key: 'aeropress', label: 'Aeropress' },
  { key: 'french-press', label: 'French Press' },
  { key: 'espresso', label: 'Espresso' },
];

const inputStyle = {
  width: '100%',
  minHeight: 48,
  padding: '12px 16px',
  fontSize: 16,
  fontFamily: fonts.body,
  fontWeight: 500,
  borderRadius: radius.md,
  border: `1.5px solid ${C.border}`,
  background: C.cream,
  color: C.text,
  outline: 'none',
  boxSizing: 'border-box',
  boxShadow: shadows.e1,
  WebkitAppearance: 'none',
  transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
};

// Names each espresso dropdown; "Not sure" alone does not say which part it is.
const subLabelStyle = { ...t.body, fontWeight: 700, color: C.text, marginBottom: -4 };

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23A86A38' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 16px center',
  paddingRight: 40,
  cursor: 'pointer',
};

export default function R07Preferences() {
  const { dispatch, answers, user } = useOnboarding();

  const [grinder, setGrinder] = useState(answers?.preferences?.grinder || 'fellow-ode-gen2');
  const [grinderCustom, setGrinderCustom] = useState(answers?.preferences?.grinderCustomName || '');
  const [brewMethod, setBrewMethod] = useState(answers?.preferences?.brewMethod || 'aiden');
  const [espressoMachine, setEspressoMachine] = useState(answers?.preferences?.espressoMachine || 'unknown');
  const [espressoBasket, setEspressoBasket] = useState(answers?.preferences?.espressoBasket || 'unknown');
  const [espressoGrinder, setEspressoGrinder] = useState(answers?.preferences?.espressoGrinder || 'integrated');
  const [espressoGrinderModel, setEspressoGrinderModel] = useState(answers?.preferences?.espressoGrinderModel || '');
  const [espressoGrinderCustomName, setEspressoGrinderCustomName] = useState(answers?.preferences?.espressoGrinderCustomName || '');
  const [espressoSetupConfirmed, setEspressoSetupConfirmed] = useState(answers?.preferences?.espressoSetupConfirmed === true);
  const [displayName, setDisplayName] = useState(
    answers?.preferences?.displayName || user?.displayName || readPendingProviderDisplayName() || ''
  );

  useNativeKeyboard({ hideTabBar: false });
  useEffect(() => { warmPaywallOfferings(); }, []);

  const handleContinue = () => {
    const prefs = {
      grinder,
      grinderCustomName: grinder === 'other' ? sanitizeUserText(grinderCustom) : null,
      brewMethod,
      espressoMachine: espressoMachine === 'unknown' ? null : espressoMachine,
      espressoBasket: espressoBasket === 'unknown' ? null : espressoBasket,
      espressoGrinder,
      espressoGrinderModel: espressoGrinder === 'external' ? sanitizeUserText(espressoGrinderModel) || null : null,
      espressoGrinderCustomName: espressoGrinder === 'custom' ? sanitizeUserText(espressoGrinderCustomName) || null : null,
      espressoSetupConfirmed: espressoSetupConfirmed && espressoMachine === 'breville-barista-express' && espressoBasket === 'stock-double-single-wall',
    };
    prefs.displayName = sanitizeUserText(displayName);
    dispatch({
      type: 'ADVANCE',
      next: 'r8',
      answersPatch: { preferences: { ...(answers?.preferences || {}), ...prefs } },
    });
  };

  const handleEspressoMachineChange = (event) => {
    setEspressoMachine(event.target.value);
    if (changesEspressoEquipmentIdentity('espressoMachine')) setEspressoSetupConfirmed(false);
  };

  const handleEspressoBasketChange = (event) => {
    setEspressoBasket(event.target.value);
    if (changesEspressoEquipmentIdentity('espressoBasket')) setEspressoSetupConfirmed(false);
  };

  const handleEspressoGrinderChange = (event) => {
    setEspressoGrinder(event.target.value);
    setEspressoSetupConfirmed(false);
  };

  const handleEspressoGrinderModelChange = (event) => {
    setEspressoGrinderModel(event.target.value);
    setEspressoSetupConfirmed(false);
  };

  const handleEspressoCustomGrinderChange = (event) => {
    setEspressoGrinderCustomName(event.target.value);
    setEspressoSetupConfirmed(false);
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100dvh',
      maxHeight: '100dvh',
      background: onboardingBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar overlay />

      <div className="onb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <MascotStage src="/images/ruphus-animations/ruphus-holding-grinder.mp4" height={150} />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        onClick={(e) => {
          const tag = e.target.tagName;
          if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && tag !== 'BUTTON')
            document.activeElement?.blur();
        }}
        style={{
          padding: '4px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <m.div variants={listItem}>
          <NoteBubble>
            Last bit. Tell me what you've got and I'll set up your kit.
          </NoteBubble>
        </m.div>

        <m.div variants={listItem} style={{
          ...t.h1,
          color: C.text,
          marginTop: 2,
        }}>
          Set up your kit
        </m.div>

        <m.div variants={listItem}>
          <FieldLabel>What should I call you? <span style={{ opacity: 0.5, fontWeight: 500 }}>(optional)</span></FieldLabel>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onFocus={scrollOnFocus}
            placeholder="Your name"
            maxLength={50}
            style={inputStyle}
          />
        </m.div>

        <m.div variants={listItem}>
          <FieldLabel style={{ marginTop: 6 }}>What's your grinder?</FieldLabel>
          <select
            value={grinder}
            onChange={(e) => setGrinder(e.target.value)}
            style={selectStyle}
          >
            {GRINDERS.map(g => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
          {grinder === 'other' && (
            <m.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.soft}
            >
              <input
                type="text"
                value={grinderCustom}
                onChange={(e) => setGrinderCustom(e.target.value)}
                onFocus={scrollOnFocus}
                placeholder="Your grinder name"
                maxLength={50}
                style={{ ...inputStyle, marginTop: 8 }}
              />
            </m.div>
          )}
        </m.div>

        <m.div variants={listItem}>
          <FieldLabel style={{ marginTop: 6 }}>How do you brew?</FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {BREW_OPTIONS.map((method) => {
              const selected = brewMethod === method.key;
              return (
                <m.button
                  key={method.key}
                  onClick={() => {
                    setBrewMethod(method.key);
                    if (method.key === 'espresso') setEspressoSetupConfirmed(false);
                  }}
                  whileTap={{ scale: 0.96 }}
                  transition={spring.snappy}
                  style={{
                    minHeight: 72,
                    padding: 8,
                    background: selected ? C.accentSoft : C.cream,
                    border: `${selected ? 2 : 1.5}px solid ${selected ? C.accent : C.border}`,
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    fontFamily: fonts.body,
                    fontSize: 12,
                    fontWeight: 700,
                    color: selected ? C.accent : C.text,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    boxShadow: selected ? shadows.e1 : shadows.e0,
                    transition: 'background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {method.label}
                </m.button>
              );
            })}
          </div>
        </m.div>

        {brewMethod === 'espresso' && (
          <m.div variants={listItem} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FieldLabel style={{ marginTop: 2 }}>Espresso setup</FieldLabel>
            <label htmlFor="r07-espresso-machine" style={subLabelStyle}>Machine</label>
            <select id="r07-espresso-machine" aria-label="Espresso machine" value={espressoMachine} onChange={handleEspressoMachineChange} style={selectStyle}>
              {ESPRESSO_MACHINES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            <label htmlFor="r07-espresso-basket" style={subLabelStyle}>Basket</label>
            <select id="r07-espresso-basket" aria-label="Espresso basket" value={espressoBasket} onChange={handleEspressoBasketChange} style={selectStyle}>
              {ESPRESSO_BASKETS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            <label htmlFor="r07-espresso-grinder" style={subLabelStyle}>Grinder</label>
            <select id="r07-espresso-grinder" aria-label="Espresso grinder" value={espressoGrinder} onChange={handleEspressoGrinderChange} style={selectStyle}>
              {ESPRESSO_GRINDERS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            {espressoGrinder === 'external' && (
              <input
                type="text"
                aria-label="External espresso grinder model"
                value={espressoGrinderModel}
                onChange={handleEspressoGrinderModelChange}
                onFocus={scrollOnFocus}
                placeholder="External grinder model (optional)"
                maxLength={80}
                style={inputStyle}
              />
            )}
            {espressoGrinder === 'custom' && (
              <input
                type="text"
                aria-label="Custom espresso grinder name"
                value={espressoGrinderCustomName}
                onChange={handleEspressoCustomGrinderChange}
                onFocus={scrollOnFocus}
                placeholder="Your grinder name"
                maxLength={80}
                style={inputStyle}
              />
            )}
            {espressoBasket === 'different' && (
              <div style={{ ...t.body, color: C.textMuted, lineHeight: 1.45 }}>
                This basket stays available for chat and tasting. The Barista Express starting recipe is only offered for the verified stock double single-wall basket.
              </div>
            )}
            {espressoMachine === 'breville-barista-express' && espressoBasket === 'stock-double-single-wall' && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: C.textMuted, fontSize: 13, lineHeight: 1.45 }}>
                <input
                  type="checkbox"
                  checked={espressoSetupConfirmed}
                  onChange={(e) => setEspressoSetupConfirmed(e.target.checked)}
                  style={{ width: 20, height: 20, flex: '0 0 auto', marginTop: 1 }}
                />
                I confirm this is my Barista Express and stock double single-wall basket.
              </label>
            )}
          </m.div>
        )}
      </m.div>
      </div>

      <OnboardingCtaBar
        label="Continue"
        onClick={handleContinue}
        disabled={false}
      />
    </div>
  );
}

function FieldLabel({ children, style = {} }) {
  return (
    <div style={{
      ...t.label,
      color: C.textMuted,
      marginBottom: 6,
      ...style,
    }}>
      {children}
    </div>
  );
}
