import { useEffect, useRef, useState } from 'react';
import { haptic } from '../../lib/haptics';
import {
  purchasePackage,
  restorePurchases,
  deriveEntitlements,
} from '../../lib/revenuecat';

export function usePaywallPurchase({ open, onClose }) {
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Hold the close-after-purchase timer so we can clear it on unmount or
  // on close. Without this, a tap-to-close during the 600ms window can
  // close a freshly-reopened paywall instance.
  const closeTimerRef = useRef(null);

  // mounted ref for safe cross-async setState
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  // Clearing on unmount is not enough: the paywall root stays mounted across
  // open/close (it renders null when closed), so an unmount never happens on
  // a normal dismiss. Mirrors PaywallSheet.jsx:149-152 — without this, closing
  // during the success window leaves a live timer that fires onClose again and
  // closes a freshly-reopened instance.
  useEffect(() => {
    if (!open && closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [open]);

  async function purchase(pkg) {
    if (!pkg) return;
    setPurchasing(true);
    setError(null);
    try {
      const result = await purchasePackage(pkg);
      if (!mountedRef.current) return;
      if (result.userCancelled) {
        setPurchasing(false);
        return;
      }
      const { hasPro, hasUltra } = deriveEntitlements(result.customerInfo);
      if (!hasPro && !hasUltra) {
        setError('Purchase confirmed, but the subscription is still syncing. Tap Restore Purchases in Settings.');
        setPurchasing(false);
        return;
      }
      // Success — purchasePackage publishes customerInfo so SubscriptionContext unlocks immediately.
      // Close the paywall after a short delay so the user sees the state flip.
      haptic.success();
      setToast('Subscription active');
      closeTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setPurchasing(false);
        setToast(null);
        onClose?.();
        closeTimerRef.current = null;
      }, 600);
    } catch (err) {
      console.error('[PaywallRoast] purchase failed', err);
      if (!mountedRef.current) return;
      setError(err?.message || 'Purchase failed. Please try again.');
      setPurchasing(false);
    }
  }

  async function restore() {
    setError(null);
    try {
      const info = await restorePurchases();
      if (!mountedRef.current) return;
      const { hasPro, hasUltra } = deriveEntitlements(info);
      if (hasPro || hasUltra) {
        haptic.success();
        setToast('Subscription restored');
        closeTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setToast(null);
          onClose?.();
          closeTimerRef.current = null;
        }, 800);
      } else {
        setToast('No active subscription found');
        setTimeout(() => { if (mountedRef.current) setToast(null); }, 1800);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError('Could not restore purchases. Please try again.');
    }
  }

  function clearError() {
    setError(null);
  }

  return { purchasing, error, toast, purchase, restore, clearError };
}
