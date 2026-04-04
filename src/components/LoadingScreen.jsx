// Loading spinner
import { C, fonts } from '../styles/theme';

export const LoadingScreen = () => (
  <div style={{
    fontFamily: fonts.body,
    background: C.bg,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: C.textMuted,
    gap: 12,
  }}>
    <div style={{ fontFamily: fonts.title, fontSize: 32, color: C.accent }}>2manybeans</div>
    <div style={{ fontSize: 14 }}>Loading your beans...</div>
  </div>
);
