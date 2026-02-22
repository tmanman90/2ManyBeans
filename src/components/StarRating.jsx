// Interactive 5-star widget — ported from prototype lines 484-498
import { useState } from 'react';
import { C } from '../styles/theme';

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
            fontSize: size,
            lineHeight: 1,
            color: n <= (hover || value) ? '#D4A053' : C.borderLight,
            transition: 'color 0.1s',
          }}
        >
          {n <= (hover || value) ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
};
