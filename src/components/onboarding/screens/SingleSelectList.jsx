import { C, fonts, radius } from '../../../styles/theme';
import { haptic } from '../../../lib/haptics';

// Shared vertical list of tappable cards used by R2 (goal), R3 (pain),
// and potentially future single-select screens. Each option is a
// ≥44pt-tall button with a subtle selected state. Tapping fires haptic
// feedback and immediately advances via the provided onSelect callback.
//
// Options accept either an `icon` (Lucide component) or an `emoji`
// (string) — icon is preferred because it inherits the selected/unselected
// color state automatically.
export function SingleSelectList({ options, value, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
      {options.map((opt) => {
        const selected = value === opt.key;
        const Icon = opt.icon;
        return (
          <button
            key={opt.key}
            onClick={() => {
              haptic.selection();
              onSelect(opt.key);
            }}
            style={{
              width: '100%',
              minHeight: 56,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textAlign: 'left',
              fontSize: 16,
              fontFamily: fonts.body,
              fontWeight: 600,
              color: selected ? C.accent : C.text,
              background: selected ? C.amberBg : C.card,
              border: `1.5px solid ${selected ? C.accent : C.borderLight}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              transition: 'background 0.12s ease, border-color 0.12s ease',
            }}
          >
            {Icon && (
              <span
                style={{
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 10,
                  background: selected ? C.accent : C.amberBg,
                  color: selected ? '#fff' : C.accent,
                  border: selected ? 'none' : `1px solid #E8D5A0`,
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
                aria-hidden
              >
                <Icon size={20} strokeWidth={2} />
              </span>
            )}
            {!Icon && opt.emoji && (
              <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>
                {opt.emoji}
              </span>
            )}
            <span style={{ flex: 1 }}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default SingleSelectList;
