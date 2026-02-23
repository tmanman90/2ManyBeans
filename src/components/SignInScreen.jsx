// Google sign-in landing screen
import { C, fonts } from '../styles/theme';
import { Btn } from './Btn';

export const SignInScreen = ({ onSignIn }) => (
  <div style={{
    fontFamily: fonts.body,
    background: C.bg,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  }}>
    <div style={{ fontFamily: fonts.title, fontSize: 42, color: C.accent, marginBottom: 4 }}>
      Coffee Hub
    </div>
    <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 32, textAlign: 'center' }}>
      Track your specialty coffee rotation,<br />tastings, and freshness
    </div>
    <Btn variant="primary" onClick={onSignIn} style={{ padding: '14px 32px', fontSize: 15 }}>
      Sign in with Google
    </Btn>
  </div>
);
