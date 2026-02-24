// Interactive 5-bean rating widget — coffee bean icons
import { useState } from 'react';
import { C } from '../styles/theme';

const CoffeeBean = ({ filled, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Plump bean body — upright oval, slightly tilted for organic feel */}
    <ellipse
      cx="12" cy="12" rx="7.5" ry="10"
      transform="rotate(-15 12 12)"
      fill={filled ? '#8B6542' : 'none'}
      stroke={filled ? '#7A5535' : '#A0856B'}
      strokeWidth="1.4"
    />
    {/* Ghibli-style wavy center crease */}
    <path
      d="M12 3.5C10.5 7 10.2 10 11 12.5C11.8 15 11 18 12 21"
      stroke={filled ? '#5C3A1E' : '#A0856B'}
      strokeWidth="1.2"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

export const StarRating = ({ value, onChange, size = 22 }) => {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={() => onChange?.(value === n ? 0 : n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{
            cursor: onChange ? 'pointer' : 'default',
            lineHeight: 1,
            display: 'flex',
            transition: 'opacity 0.1s',
          }}
        >
          <CoffeeBean filled={n <= (hover || value)} size={size} />
        </span>
      ))}
    </div>
  );
};
