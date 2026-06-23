// Colored pill status badge — refined editorial pill
import { C, radius, shadows, type } from '../styles/theme';

export const Badge = ({ children, color, bg }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    background: bg,
    color,
    ...type.caption,
    fontFamily: type.caption.fontFamily,
    padding: '4px 10px',
    borderRadius: radius.pill,
    whiteSpace: 'nowrap',
    letterSpacing: '0.04em',
    minHeight: 24,
    border: `1px solid ${color}22`,
    boxShadow: shadows.e1,
  }}>
    {children}
  </span>
);
