// Paywall screenshot harness — renders the REAL PaywallSheet with a mocked
// StoreKit payload (see paywall-harness-rc-mock.js) so we can capture what each
// trigger context actually looks like. Driven by scripts/shot-paywall.mjs.
//
// Query params:
//   ?ctx=scan_cap|taste_cap|product_shot|aiden|onboarding|generic
//   ?promote=pro|ultra
//   ?trial=3day|7day|none
//   ?offerings=empty|null   (error states)
//   ?slow=1                 (hold the loading state)
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import './src/styles/global.css';

// Make the sheet believe it's running on device. PaywallSheet renders a
// "subscriptions are in the iOS app" notice otherwise, and revenuecat.js
// short-circuits every call.
Capacitor.isNativePlatform = () => true;
Capacitor.getPlatform = () => 'ios';
Capacitor.isPluginAvailable = () => true;

const { PaywallSheet } = await import('./src/components/PaywallSheet');

const params = new URLSearchParams(window.location.search);
const context = {
  trigger: params.get('ctx') || 'generic',
  promote: params.get('promote') || 'pro',
};

createRoot(document.getElementById('root')).render(
  <PaywallSheet open context={context} onClose={() => {}} />
);
