import { Check } from 'lucide-react';
import { C, fonts, type, radius, shadows, motion as motionTokens } from '../../../styles/theme';
import { haptic } from '../../../lib/haptics';
import { m, spring, listContainer, listItem } from '../../../lib/motion';

// Shared vertical list of tappable cards used by R2 (goal), R3 (pain),
// and potentially future single-select screens. Each option is a
// ≥52pt-tall button with a premium selected state. Tapping fires haptic
// feedback and immediately advances via the provided onSelect callback.
//
// Options accept either an `icon` (Lucide component) or an `emoji`
// (string) — icon is preferred because it inherits the selected/unselected
// color state automatically.
export function SingleSelectList({ options, value, onSelect }) {
  return (
    <m.div
      variants={listContainer}
      initial="initial"
      animate="animate"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}
    >
      {options.map((opt) => {
        const selected = value === opt.key;
        const Icon = opt.icon;
        return (
          <m.button
            key={opt.key}
            variants={listItem}
            onClick={() => {
              haptic.selection();
              onSelect(opt.key);
            }}
            whileTap={{ scale: 0.978 }}
            transition={spring.snappy}
            style={{
              width: '100%',
              minHeight: 58,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textAlign: 'left',
              fontSize: type.bodyL.fontSize,
              fontFamily: type.bodyL.fontFamily,
              fontWeight: 600,
              color: selected ? C.accent : C.text,
              background: selected ? C.accentSoft : C.cream,
              border: `1.5px solid ${selected ? C.accent : C.hairline}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              boxShadow: selected ? shadows.e2 : shadows.e1,
              transition: `background ${motionTokens.dur.fast}s ${motionTokens.cssOut}, border-color ${motionTokens.dur.fast}s ${motionTokens.cssOut}, box-shadow ${motionTokens.dur.fast}s`,
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
            }}
          >
            {/* Icon badge */}
            {Icon && (
              <span
                style={{
                  width: 38,
                  height: 38,
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.sm,
                  background: selected ? C.accent : C.accentSoft,
                  color: selected ? C.cream : C.accent,
                  border: selected ? 'none' : `1px solid ${C.border}`,
                  transition: `background ${motionTokens.dur.fast}s, color ${motionTokens.dur.fast}s`,
                }}
                aria-hidden
              >
                <Icon size={20} strokeWidth={2} />
              </span>
            )}

            {/* Emoji fallback */}
            {!Icon && opt.emoji && (
              <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }} aria-hidden>
                {opt.emoji}
              </span>
            )}

            <span style={{ flex: 1 }}>{opt.label}</span>

            {/* Checkmark on selected */}
            {selected && (
              <span style={{
                width: 22, height: 22, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: radius.pill,
                background: C.accent,
              }}>
                <Check size={13} color={C.cream} strokeWidth={2.5} />
              </span>
            )}
          </m.button>
        );
      })}
    </m.div>
  );
}

export default SingleSelectList;
