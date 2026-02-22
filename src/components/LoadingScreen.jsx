// Loading spinner — ported from prototype lines 1217-1221
import { Coffee } from 'lucide-react';
import { C, fonts } from '../styles/theme';

export const LoadingScreen = () => (
  <div style={{
    fontFamily: fonts.body,
    background: C.bg,
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: C.textMuted,
  }}>
    <Coffee size={32} style={{ marginRight: 12, opacity: 0.5 }} /> Loading your beans...
  </div>
);
