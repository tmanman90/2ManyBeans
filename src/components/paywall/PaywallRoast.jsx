// PaywallRoast — the full-screen three-step paywall (value -> plans ->
// compare). Drop-in replacement for PaywallSheet: same
// ({ open, context, onClose }) contract, plus `initialStep` as a harness
// seam so Playwright can land directly on a given step (click-driving to
// step 3 is flaky).
//
// Apple rejection patterns this design avoids (Q1 2026, see
// PaywallSheet.jsx header for the full list):
//   - No billing-cycle toggle; all four prices visible simultaneously.
//   - Every price is pkg.product.priceString, never hardcoded.
//   - Trial language only when a real free introductory offer exists.
//   - Terms of Use + Privacy Policy + Restore Purchases in the paywall UI.

import { useEffect, useRef, useState } from 'react';
import '../../styles/paywall.css';
import { PW_CSS_VARS } from './paywallTheme';
import { usePaywallOfferings } from './usePaywallOfferings';
import { usePaywallPurchase } from './usePaywallPurchase';
import { haptic } from '../../lib/haptics';
import PaywallToast from './PaywallToast';
import StepValue from './steps/StepValue';
import StepPlans from './steps/StepPlans';
import StepCompare from './steps/StepCompare';

export default function PaywallRoast({ open, context, onClose, initialStep = 'value' }) {
  // Step machine. `seq` increments on every navigation so the step node's
  // React key changes even when revisiting the same step.
  const [nav, setNav] = useState({ step: initialStep, dir: 'forward', seq: 0 });

  // Selection state. Reset ONLY on the open false→true transition (see the
  // wasOpenRef effect): usePaywall mints a new context object on every
  // openPaywall, so a naive [context] dep would wipe the user's manual
  // tier/cycle picks on unrelated re-renders (mirrors PaywallSheet.jsx:128).
  const [tier, setTier] = useState('pro'); // 'pro' | 'ultra'
  const [cycle, setCycle] = useState('annual'); // 'annual' | 'monthly'
  const [devNotice, setDevNotice] = useState(null);
  const wasOpenRef = useRef(false);

  const { packages, offering, loading, error, retry, isWeb, isDevMock } = usePaywallOfferings({ open });
  const {
    purchasing,
    error: purchaseError,
    toast,
    purchase,
    restore,
    clearError,
  } = usePaywallPurchase({ open, onClose });

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setNav({ step: initialStep, dir: 'forward', seq: 0 });
      // Pre-select Ultra when the paywall was opened by an Ultra-only
      // feature (Aiden push, multi-brewer); Pro Annual otherwise.
      setTier(context?.promote === 'ultra' ? 'ultra' : 'pro');
      setCycle('annual');
      setDevNotice(null);
      clearError();
    }
    // Also reset on the closing edge. Effects run after render, so resetting
    // only on open means a reopen paints one frame of the step the user left
    // on (close from step 3, reopen, and compare flashes before value). We
    // render null while closed, so resetting here is invisible.
    if (!open && wasOpenRef.current) {
      setNav({ step: initialStep, dir: 'forward', seq: 0 });
    }
    wasOpenRef.current = open;
    // clearError is recreated per render but only invoked on the open edge;
    // adding it to deps would defeat the transition guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context?.promote, initialStep]);

  // Body scroll lock while open. This is a full-screen opaque takeover, not
  // a sheet: without the lock, over-scrolling rubber-bands and reveals the
  // app behind it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function go(step, dir = 'forward') {
    setNav((n) => ({ step, dir, seq: n.seq + 1 }));
  }

  function selectSku(nextTier, nextCycle) {
    if (nextTier !== tier || nextCycle !== cycle) haptic.selection();
    setTier(nextTier);
    setCycle(nextCycle);
    setDevNotice(null);
    clearError();
  }

  // A purchase genuinely cannot complete while the dev offerings stand-in is
  // in use: the dev app has no StoreKit products at all (its bundle id is not
  // the one the products are registered under). Say that plainly instead of
  // letting the RevenueCat SDK surface a raw internal error.
  function handlePurchase(pkg) {
    if (isDevMock) {
      setDevNotice('Dev app cannot complete purchases. These are stub prices; the real flow needs a TestFlight build.');
      return;
    }
    setDevNotice(null);
    return purchase(pkg);
  }

  if (!open) return null;

  const stepProps = {
    packages,
    loading,
    error,
    retry,
    isWeb,
    tier,
    cycle,
    onSelectSku: selectSku,
    purchasing,
    purchaseError: purchaseError || devNotice,
    onPurchase: handlePurchase,
    onRestore: restore,
    onClose,
  };

  let stepEl;
  if (nav.step === 'plans') {
    stepEl = (
      <StepPlans
        {...stepProps}
        onBack={() => go('value', 'back')}
        onCompare={() => go('compare')}
      />
    );
  } else if (nav.step === 'compare') {
    stepEl = <StepCompare {...stepProps} onBack={() => go('plans', 'back')} />;
  } else {
    stepEl = (
      <StepValue
        trigger={context?.trigger}
        offering={offering}
        onContinue={() => go('plans')}
        onClose={onClose}
      />
    );
  }

  return (
    // .pw-root in paywall.css is position:relative/height:100%; the fixed
    // takeover positioning lives here. z-index 2000 is non-negotiable: the
    // paywall opens from INSIDE Modal.jsx (z 1000) via ScanSheet and
    // EditBeanModal, and below 2000 it renders behind the modal that
    // launched it.
    <div
      className="pw-root"
      style={{ ...PW_CSS_VARS, position: 'fixed', inset: 0, zIndex: 2000 }}
    >
      <div className="pw-grain" />
      {/* Stub prices are in use (dev app cannot reach StoreKit). Never renders
          in production — devOfferingsEnabled() is compile-time gated. */}
      {isDevMock ? <div className="pw-devbadge">Dev prices</div> : null}
      <PaywallToast message={toast} />
      <div className="pw-stage">
        {/*
          The key is LOAD-BEARING, do not remove it: only one step is
          mounted at a time, and the push animation is a CSS class on the
          incoming node. Changing a class or data attribute on an existing
          node does NOT restart a CSS animation — only a fresh DOM node
          runs it, and `step + seq` guarantees a fresh node on every
          navigation (including back to a previously-visited step).
        */}
        <div
          className={`pw-step ${nav.dir === 'back' ? 'pw-step-back' : 'pw-step-fwd'}`}
          key={`${nav.step}-${nav.seq}`}
        >
          {stepEl}
        </div>
      </div>
    </div>
  );
}
