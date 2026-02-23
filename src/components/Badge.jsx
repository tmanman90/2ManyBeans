// Colored pill status badge — micro-shadow polish
export const Badge = ({ children, color, bg }) => (
  <span style={{
    background: bg,
    color,
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 99,
    whiteSpace: 'nowrap',
    letterSpacing: 0.3,
    boxShadow: '0 1px 3px rgba(92,61,46,0.06)',
  }}>
    {children}
  </span>
);
