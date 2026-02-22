// Colored pill status badge — ported from prototype line 219-221
export const Badge = ({ children, color, bg }) => (
  <span style={{
    background: bg,
    color,
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 99,
    whiteSpace: 'nowrap',
    letterSpacing: 0.3,
  }}>
    {children}
  </span>
);
