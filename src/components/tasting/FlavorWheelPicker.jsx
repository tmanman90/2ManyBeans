// FlavorWheelPicker — custom-from-scratch descriptor picker built on the SCA flavor-wheel tree.
// Tier-1 family chips (always available) expand to a spring-revealed drawer of Tier-2 groups and
// Tier-3 specific descriptors. Tier-3 specifics are GATED by palate level (texture/family first,
// specifics unlock as you log cups). Multi-select; selected descriptors lift into accent glass
// chips. transform/opacity-only motion; reduced-motion snaps.
import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { FLAVOR_WHEEL, tier3Unlocked } from '../../lib/flavorWheel';
import { haptic } from '../../lib/haptics';
import { C, fonts, radius, shadows, motion as M } from '../../styles/theme';

// Soft per-family hues (kept low-sat to live inside the warm system; accent stays dominant).
const FAMILY_DOT = {
  fruity: '#C2603F', floral: '#B57BA6', sweet: '#B6862F', nutcocoa: '#7A5230',
  spices: '#A85537', roasted: '#5C4636', green: '#5B8762', ferment: '#8C5B86', offnotes: '#8A7765',
};

function Chip({ label, active, locked, onClick, reduce }) {
  return (
    <m.button
      type="button"
      onClick={locked ? undefined : onClick}
      whileTap={reduce || locked ? {} : { scale: 0.95 }}
      transition={M.spring.snappy}
      aria-pressed={active}
      style={{
        position: 'relative', border: `1px solid ${active ? 'rgba(255,255,255,0.4)' : C.border}`,
        background: active ? C.accent : locked ? C.cardMuted : C.cream,
        color: active ? C.cream : locked ? C.textLight : C.text,
        borderRadius: radius.pill, padding: '8px 14px', minHeight: 38,
        fontFamily: fonts.body, fontWeight: 700, fontSize: 13, letterSpacing: '-0.005em',
        textTransform: 'capitalize', cursor: locked ? 'not-allowed' : 'pointer',
        opacity: locked ? 0.6 : 1, WebkitTapHighlightColor: 'transparent',
        boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 8px rgba(162,99,47,0.3)' : 'none',
      }}
    >
      {locked && <span aria-hidden style={{ marginRight: 5, opacity: 0.7 }}>🔒</span>}
      {label}
      {active && <span aria-hidden style={{ marginLeft: 6, fontSize: 11 }}>✓</span>}
    </m.button>
  );
}

export function FlavorWheelPicker({ selected = [], onToggle, level = 1, reduce = false }) {
  const [openKey, setOpenKey] = useState(null);
  const unlocked = tier3Unlocked(level);
  const has = (label) => selected.includes(label);

  const toggleFamily = (key) => {
    haptic.light();
    setOpenKey(openKey === key ? null : key);
  };
  const pick = (label) => { haptic.selection(); onToggle(label); };

  return (
    <div style={{ width: '100%' }}>
      {/* selected summary — plain div, visible by default (no framer-animate visibility gate) */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
          {selected.map((s) => (
            <Chip key={s} label={s} active onClick={() => pick(s)} reduce={reduce} />
          ))}
        </div>
      )}

      {/* family petals */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {FLAVOR_WHEEL.map((fam) => {
          const open = openKey === fam.key;
          return (
            <m.button
              key={fam.key}
              type="button"
              onClick={() => toggleFamily(fam.key)}
              whileTap={reduce ? {} : { scale: 0.96 }}
              transition={M.spring.snappy}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                border: `1px solid ${open ? C.accent : C.border}`,
                background: open ? C.accentSoft : C.cream, color: C.text,
                borderRadius: radius.pill, padding: '9px 15px', minHeight: 40,
                fontFamily: fonts.body, fontWeight: 700, fontSize: 13.5,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                boxShadow: open ? 'none' : shadows.e1,
              }}
            >
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: FAMILY_DOT[fam.key] || C.accent, flexShrink: 0 }} />
              {fam.label}
              {fam.flag && <span aria-hidden style={{ fontSize: 10, opacity: 0.6 }}>!</span>}
            </m.button>
          );
        })}
      </div>

      {/* expanded drawer — plain div, visible by default (re-keyed per family so the CSS fade runs) */}
      {openKey && (
        <div key={openKey} className={reduce ? undefined : 'wiz-stage-in'}>
            <div style={{ marginTop: 12, padding: 14, background: C.bgDeep, borderRadius: radius.md, border: `1px solid ${C.hairline}` }}>
              {(() => {
                const fam = FLAVOR_WHEEL.find((f) => f.key === openKey);
                const groups = fam.sub || [{ key: fam.key, label: fam.label, items: fam.items }];
                return groups.map((g) => (
                  <div key={g.key} style={{ marginBottom: 12 }}>
                    {/* broad pick (Tier-2 / family) — ALWAYS selectable, the family-first path */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
                      <Chip label={g.label} active={has(g.label)} onClick={() => pick(g.label)} reduce={reduce} />
                      {unlocked && <span aria-hidden style={{ ...typeLabel, color: C.textLight }}>or</span>}
                      {unlocked && g.items.map((it) => (
                        <Chip key={it} label={it} active={has(it)} onClick={() => pick(it)} reduce={reduce} />
                      ))}
                    </div>
                  </div>
                ));
              })()}
              {!unlocked && (
                <div style={{ fontFamily: fonts.body, fontSize: 11.5, fontWeight: 600, color: C.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                  Naming specific flavors unlocks as your palate develops — log a few more cups. For now, pick the family that fits.
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  );
}

const typeLabel = { fontFamily: fonts.body, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textLight };
