// Step 2 — Plans. Pro and Ultra side by side, each card showing its annual
// and monthly price simultaneously (Apple mass-rejected billing-cycle
// toggles in Jan 2026 — all four prices stay visible). Annual is the hero
// row with the live-computed Save badge; Ultra carries Best value.
//
// The two tier cards animate TOGETHER (one .pw-in wrapper, one delay):
// side-by-side peers arriving at different times read as a bug.

import { introOfferFromPackage } from '../../../lib/trialOffer';
import PaywallChrome from '../PaywallChrome';
import PaywallCTABar from '../PaywallCTABar';
import TierCard from '../TierCard';

const WEB_MESSAGE = 'Subscriptions are available in the 2manybeans iOS app.';

function cycleNoun(cycle) {
  return cycle === 'annual' ? 'year' : 'month';
}

export default function StepPlans({
  packages,
  loading,
  error,
  retry,
  isWeb,
  tier,
  cycle,
  onSelectSku,
  purchasing,
  purchaseError,
  onPurchase,
  onCompare,
  onRestore,
  onBack,
  onClose,
}) {
  const selectedPkg = packages[`${tier}${cycle === 'annual' ? 'Annual' : 'Monthly'}`] ?? null;
  const intro = introOfferFromPackage(selectedPkg);

  // "Every plan starts with a trial" is only claimed when every loaded
  // package really carries a free intro offer; otherwise the subhead stays
  // neutral and trial language lives in the per-package fineprint only.
  const allPkgs = [packages.proMonthly, packages.proAnnual, packages.ultraMonthly, packages.ultraAnnual];
  const allHaveTrial = allPkgs.every(Boolean) && allPkgs.every((p) => introOfferFromPackage(p));

  const showCards = !isWeb && !error;

  const fineprint = selectedPkg
    ? intro
      ? `${intro.days} days free, then ${selectedPkg.product.priceString} per ${cycleNoun(cycle)}. Cancel anytime in Settings.`
      : `${selectedPkg.product.priceString} per ${cycleNoun(cycle)}. Renews automatically. Cancel anytime in Settings.`
    : null;

  let ctaLabel = intro ? `Start my ${intro.label}` : 'Subscribe';
  let ctaAction = () => onPurchase(selectedPkg);
  let ctaDisabled = !selectedPkg || purchasing;
  if (isWeb) {
    ctaLabel = 'Close';
    ctaAction = onClose;
    ctaDisabled = false;
  } else if (error) {
    ctaLabel = 'Try again';
    ctaAction = retry;
    ctaDisabled = false;
  }

  return (
    <>
      <PaywallChrome onBack={onBack} onClose={onClose} />
      <div className="pw-step-scroll">
        <div className="pw-head-c pw-in" style={{ '--pw-d': '0ms' }}>
          <h2 className="pw-h1 pw-h1-sm">Pick your plan</h2>
          <p className="pw-sub">
            {allHaveTrial && intro
              ? `Every plan starts with a ${intro.label}. Cancel anytime.`
              : 'Cancel anytime.'}
          </p>
        </div>

        {isWeb ? (
          <p className="pw-sub pw-head-c" style={{ marginTop: 32 }}>{WEB_MESSAGE}</p>
        ) : error ? (
          <p className="pw-sub pw-head-c" style={{ marginTop: 32 }}>{error}</p>
        ) : (
          <div className="pw-plan-grid pw-in" style={{ '--pw-d': '140ms' }}>
            <TierCard
              name="Pro"
              desc="The daily essentials, unlimited."
              annualPkg={packages.proAnnual}
              monthlyPkg={packages.proMonthly}
              selected={tier === 'pro'}
              cycle={cycle}
              onSelect={(c) => onSelectSku('pro', c)}
              loading={loading}
            />
            <TierCard
              name="Ultra"
              desc="Everything, plus your Aiden."
              bestValue
              annualPkg={packages.ultraAnnual}
              monthlyPkg={packages.ultraMonthly}
              selected={tier === 'ultra'}
              cycle={cycle}
              onSelect={(c) => onSelectSku('ultra', c)}
              loading={loading}
            />
          </div>
        )}

        {purchaseError && showCards ? <p className="pw-error">{purchaseError}</p> : null}
      </div>

      <PaywallCTABar
        label={ctaLabel}
        onPress={ctaAction}
        loading={purchasing}
        disabled={ctaDisabled}
        fineprint={showCards ? fineprint : null}
        legal
        onRestore={onRestore}
        delay={220}
      >
        {showCards ? (
          <button className="pw-compare-link" type="button" onClick={onCompare}>
            Compare plans
          </button>
        ) : null}
      </PaywallCTABar>
    </>
  );
}
