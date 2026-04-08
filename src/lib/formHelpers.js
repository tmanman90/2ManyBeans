// Shared form utilities — keyboard scroll handling
import { Capacitor } from '@capacitor/core';

// Debounced scroll-on-focus for web only.
// On native, Modal.jsx handles auto-scroll via Keyboard plugin keyboardDidShow events.
// On web (no Keyboard plugin), this provides the fallback.
let scrollTimer;
export const scrollOnFocus = e => {
  if (Capacitor.isNativePlatform()) return;
  const t = e.target;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350);
};
