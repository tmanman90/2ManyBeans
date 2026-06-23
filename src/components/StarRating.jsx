// Interactive 5-bean rating widget — coffee bean icons
import { useState } from 'react';
import { m, spring, popIn } from '../lib/motion';
import { C } from '../styles/theme';

// Refined coffee bean SVG — crisp filled/unfilled states using design tokens
const CoffeeBean = ({ filled, size, hovered }) => {
  const fillColor = filled ? C.accent : 'none';
  const strokeColor = filled ? C.accentDark : C.border;
  const creaseColor = filled ? C.accentDark : C.border;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      {/* Plump bean body — upright oval, slightly tilted for organic feel */}
      <ellipse
        cx="12" cy="12" rx="7.5" ry="10"
        transform="rotate(-15 12 12)"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={filled ? 1.2 : 1.4}
        style={{ transition: `fill ${0.12}s, stroke ${0.12}s` }}
      />
      {/* Wavy center crease */}
      <path
        d="M12 3.5C10.5 7 10.2 10 11 12.5C11.8 15 11 18 12 21"
        stroke={creaseColor}
        strokeWidth={filled ? 1.1 : 1.0}
        strokeLinecap="round"
        fill="none"
        style={{ transition: `stroke ${0.12}s` }}
      />
    </svg>
  );
};

export const StarRating = ({ value, onChange, size = 22 }) => {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const isFilled = n <= (hover || value);
        const isInteractive = !!onChange;
        return (
          <m.span
            key={n}
            onClick={() => onChange?.(value === n ? 0 : n)}
            onMouseEnter={() => isInteractive && setHover(n)}
            onMouseLeave={() => setHover(0)}
            // Spring pop on selection; subtle press scale for interactivity
            whileTap={isInteractive ? { scale: 0.82 } : undefined}
            animate={isFilled && isInteractive ? { scale: [1, 1.18, 1] } : { scale: 1 }}
            transition={spring.bouncy}
            style={{
              cursor: isInteractive ? 'pointer' : 'default',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              // 44px minimum tap target on iOS
              minWidth: isInteractive ? 44 : undefined,
              minHeight: isInteractive ? 44 : undefined,
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            <CoffeeBean filled={isFilled} size={size} hovered={n <= hover} />
          </m.span>
        );
      })}
    </div>
  );
};
