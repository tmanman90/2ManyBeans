// Paywall screenshot harness — renders the REAL paywall (classic PaywallSheet
// or the new PaywallRoast) with a mocked StoreKit payload (see
// paywall-harness-rc-mock.js) so we can capture what each trigger context
// actually looks like. Driven by scripts/shot-paywall.mjs.
//
// Query params:
//   ?ui=roast|classic     which paywall to render (default: roast)
//   ?ctx=scan_cap|taste_cap|product_shot|aiden|chat|recipe|generic|onboarding
//   ?promote=pro|ultra
//   ?trial=3day|7day|none
//   ?offerings=empty|null   (error states)
//   ?slow=1                 (hold the loading state)
//   ?step=value|plans|compare  (roast only — PaywallRoast's initialStep prop,
//                                a harness seam so Playwright can land
//                                directly on a step; click-driving to step 3
//                                is flaky)
//   ?native=0                (force Capacitor.isNativePlatform() -> false,
//                              for the "subscriptions are in the iOS app"
//                              web-not-native state; default is native=1)
//   ?purchase=slow            (roast only — hold usePaywallPurchase's
//                              `purchasing` state so it's screenshot-able;
//                              see paywall-harness-rc-mock.js)
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import './src/styles/global.css';

const params = new URLSearchParams(window.location.search);
const isNative = params.get('native') !== '0';

// Make the sheet believe it's running on device by default. PaywallSheet /
// PaywallRoast render a "subscriptions are in the iOS app" notice otherwise,
// and revenuecat.js short-circuits every call. This default (native=1) is
// deliberate and must stay; ?native=0 is the opt-in escape hatch for the
// web-not-native shot.
Capacitor.isNativePlatform = () => isNative;
Capacitor.getPlatform = () => (isNative ? 'ios' : 'web');
Capacitor.isPluginAvailable = () => isNative;

const ui = params.get('ui') || 'roast';
const context = {
  trigger: params.get('ctx') || 'generic',
  promote: params.get('promote') || 'pro',
};

let element;
if (ui === 'classic') {
  const { PaywallSheet } = await import('./src/components/PaywallSheet');
  element = <PaywallSheet open context={context} onClose={() => {}} />;
} else {
  const { default: PaywallRoast } = await import('./src/components/paywall/PaywallRoast');
  const initialStep = params.get('step') || 'value';
  element = <PaywallRoast open context={context} onClose={() => {}} initialStep={initialStep} />;
}

createRoot(document.getElementById('root')).render(element);
