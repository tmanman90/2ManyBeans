// Step 3 — Compare. Full Pro vs Ultra matrix with both tiers' monthly and
// annual prices repeated in the header (all four prices visible on this
// step too), plus the "everything in the free plan" block. Checks render
// in body-text white and absent features as text-3 dashes — gold never
// appears in the matrix (accent budget).

import { COMPARE_ROWS, FREE_TIER_ROWS } from '../paywallCopy';
import { introOfferFromPackage } from '../../../lib/trialOffer';
import { PwIcon } from '../ValueRow';
import PaywallChrome from '../PaywallChrome';
import PaywallCTABar from '../PaywallCTABar';

function HeaderCol({ name, monthlyPkg, annualPkg }) {
  const mo = monthlyPkg?.product?.priceString;
  const yr = annualPkg?.product?.priceString;
  return (
    <span className="pw-mx-col">
      <span className="pw-mx-plan">{name}</span>
      {mo && yr ? (
        <span className="pw-mx-price pw-price">
          {mo}/mo
          <br />
          {yr}/yr
        </span>
      ) : null}
    </span>
  );
}

function Cell({ included }) {
  return (
    <span className="pw-mx-cell">
      {included ? <PwIcon name="check" /> : <span className="pw-mx-dash">&#8211;</span>}
    </span>
  );
}

export default function StepCompare({
  packages,
  tier,
  cycle,
  purchasing,
  purchaseError,
  onPurchase,
  onRestore,
  onBack,
  onClose,
}) {
  const selectedPkg = packages[`${tier}${cycle === 'annual' ? 'Annual' : 'Monthly'}`] ?? null;
  const intro = introOfferFromPackage(selectedPkg);

  const fineprint = selectedPkg
    ? intro
      ? `${intro.days} days free, then ${selectedPkg.product.priceString} per ${cycle === 'annual' ? 'year' : 'month'} for ${tier === 'ultra' ? 'Ultra' : 'Pro'}. Cancel anytime in Settings.`
      : `${selectedPkg.product.priceString} per ${cycle === 'annual' ? 'year' : 'month'} for ${tier === 'ultra' ? 'Ultra' : 'Pro'}. Renews automatically. Cancel anytime in Settings.`
    : null;

  return (
    <>
      <PaywallChrome onBack={onBack} onClose={onClose} />
      <div className="pw-step-scroll">
        <div className="pw-head-c pw-in" style={{ '--pw-d': '0ms' }}>
          <h2 className="pw-h1 pw-h1-sm">What&#8217;s in each plan</h2>
          <p className="pw-sub">Side by side, nothing hidden.</p>
        </div>

        <div className="pw-matrix pw-in" style={{ '--pw-d': '80ms' }}>
          <div className="pw-mx-row pw-mx-head">
            <span />
            <HeaderCol name="Pro" monthlyPkg={packages.proMonthly} annualPkg={packages.proAnnual} />
            <HeaderCol name="Ultra" monthlyPkg={packages.ultraMonthly} annualPkg={packages.ultraAnnual} />
          </div>
          {COMPARE_ROWS.map((row) => (
            <div className="pw-mx-row" key={row.feature}>
              <span className="pw-mx-feat">
                {row.feature}
                {row.detail ? <small>{row.detail}</small> : null}
              </span>
              <Cell included={row.pro} />
              <Cell included={row.ultra} />
            </div>
          ))}
        </div>

        <div className="pw-free-block pw-in" style={{ '--pw-d': '160ms' }}>
          <h4>Everything in the free plan stays free</h4>
          <p>{FREE_TIER_ROWS.join(' · ')}</p>
        </div>

        {purchaseError ? <p className="pw-error">{purchaseError}</p> : null}
      </div>

      <PaywallCTABar
        label={intro ? `Start my ${intro.label}` : 'Subscribe'}
        onPress={() => onPurchase(selectedPkg)}
        loading={purchasing}
        disabled={!selectedPkg || purchasing}
        fineprint={fineprint}
        legal
        onRestore={onRestore}
        delay={240}
      />
    </>
  );
}
