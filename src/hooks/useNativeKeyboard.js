// Shared Capacitor keyboard hook. Replaces the duplicate listener setup in
// ChatTab and TastingTab, and — critically — serializes tab-bar visibility
// through a module-level ref count so two components racing to hide/show
// .app-tab-bar can't interleave and leave the bar in the wrong state.
//
// Contract:
//  - Call in any component that needs to know the iOS keyboard height.
//  - The hook returns the current keyboardHeight (0 when closed on native,
//    always 0 on web).
//  - While `hideTabBar` is true (default), the hook will hide the global
//    .app-tab-bar whenever the keyboard is open. Multiple mounted components
//    increment a shared ref count; the tab bar only reappears when every
//    caller's keyboard has closed.
//  - On unmount, any contribution this caller made to the hide count is
//    reversed so the tab bar can never be stuck hidden.
import { useEffect, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

// Module-scoped shared state. Persists across hook instances so two
// simultaneously-mounted components don't fight.
let tabBarHideCount = 0;
function setTabBarHidden(hidden) {
  const el = document.querySelector('.app-tab-bar');
  if (!el) return;
  el.style.display = hidden ? 'none' : 'flex';
}
function incHide() {
  tabBarHideCount += 1;
  if (tabBarHideCount === 1) setTabBarHidden(true);
}
function decHide() {
  if (tabBarHideCount > 0) tabBarHideCount -= 1;
  if (tabBarHideCount === 0) setTabBarHidden(false);
}

export function useNativeKeyboard({ hideTabBar = true, enabled = true } = {}) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Tracks whether THIS hook instance currently has a hide contribution in
  // the shared count, so we correctly decrement on keyboard close/unmount.
  const ownsHideRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!Capacitor.isNativePlatform()) return;

    let canceled = false;
    let cleanup;

    import('@capacitor/keyboard').then(({ Keyboard }) => {
      if (canceled) return;
      const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
        setKeyboardHeight(info.keyboardHeight);
        if (hideTabBar && !ownsHideRef.current) {
          ownsHideRef.current = true;
          incHide();
        }
      });
      const hideListener = Keyboard.addListener('keyboardWillHide', () => {
        setKeyboardHeight(0);
        if (ownsHideRef.current) {
          ownsHideRef.current = false;
          decHide();
        }
      });
      cleanup = () => {
        showListener.then(h => h.remove());
        hideListener.then(h => h.remove());
      };
    });

    return () => {
      canceled = true;
      if (cleanup) cleanup();
      // If we're torn down while our keyboard is still up, release our hide
      // contribution so the tab bar can reappear.
      if (ownsHideRef.current) {
        ownsHideRef.current = false;
        decHide();
      }
      // And always reset local state to avoid a stale stale-close frame.
      setKeyboardHeight(0);
    };
  }, [enabled, hideTabBar]);

  return keyboardHeight;
}
