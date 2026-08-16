// One tier card (Pro or Ultra) for step 2.
//
// MFP dark-plan anatomy adapted to two side-by-side columns (Apple requires
// all four prices visible simultaneously — no billing-cycle toggle):
// outline directly on the canvas, Save badge INSIDE the card above the
// annual price, gold border + gold-filled check when selected. Annual is
// the hero row; monthly is the quiet second row.
//
// Every price renders pkg.product.priceString verbatim (never a hardcoded
// or reformatted price — Apple 3.1.2). The savings badge and the
// effective-monthly note are computed live from the two priceStrings and
// simply disappear when parsing fails, rather than guessing.

import { m } from '../../lib/motion';
import { PwIcon } from './ValueRow';

// Parse the numeric amount out of a StoreKit priceString ("$49.99",
// "49,99 US$", "US$ 49.99"...). Returns NaN when it can't be done safely.
export function parsePriceAmount(priceString) {
  if (!priceString) return NaN;
  const digits = String(priceString).replace(/[^0-9.,]/g, '');
  if (!digits) return NaN;
  // Treat the LAST separator as the decimal mark, strip the rest as
  // thousands separators. Covers both 1,234.56 and 1.234,56.
  const lastSep = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
  if (lastSep === -1) return parseFloat(digits);
  const intPart = digits.slice(0, lastSep).replace(/[.,]/g, '');
  const decPart = digits.slice(lastSep + 1);
  return parseFloat(`${intPart}.${decPart}`);
}

// "Save 17%" computed from the real prices; null when either fails to parse
// or the result is nonsensical.
export function savingsPercent(annualPkg, monthlyPkg) {
  const annual = parsePriceAmount(annualPkg?.product?.priceString);
  const monthly = parsePriceAmount(monthlyPkg?.product?.priceString);
  if (!annual || !monthly || !isFinite(annual) || !isFinite(monthly)) return null;
  const pct = Math.round((1 - annual / (monthly * 12)) * 100);
  return pct >= 1 && pct <= 99 ? pct : null;
}

// "$4.17 a month" under the annual price. Reuses the currency affix from the
// real priceString so we never invent a currency symbol; skipped entirely
// when the string shape is unfamiliar.
function effectiveMonthly(annualPkg) {
  const str = annualPkg?.product?.priceString;
  const amount = parsePriceAmount(str);
  if (!amount || !isFinite(amount)) return null;
  const perMonth = (amount / 12).toFixed(2);
  const match = /^([^0-9]*)[0-9][0-9.,]*([^0-9]*)$/.exec(String(str).trim());
  if (!match) return null;
  return `${match[1]}${perMonth}${match[2]} a month`;
}

function Skeleton({ width, height, radius = 14 }) {
  return (
    <span
      className="pw-skel"
      style={{ display: 'block', width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

function SkuRow({ selected, onPress, children }) {
  return (
    <m.button
      className={`pw-sku${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      onClick={onPress}
      whileTap={{ scale: 0.98 }}
    >
      {children}
      <span className="pw-chk">
        <PwIcon name="check" />
      </span>
    </m.button>
  );
}

export default function TierCard({
  name,
  desc,
  bestValue = false,
  annualPkg,
  monthlyPkg,
  selected = false,
  cycle = 'annual',
  onSelect,
  loading = false,
}) {
  const pct = savingsPercent(annualPkg, monthlyPkg);
  const perMonth = effectiveMonthly(annualPkg);

  return (
    <div className={`pw-plan-card${selected ? ' is-selected' : ''}`}>
      <div className="pw-plan-head">
        <h3 className="pw-plan-name">
          {name}
          {bestValue ? <span className="pw-badge">Best value</span> : null}
        </h3>
        <p className="pw-plan-desc">{desc}</p>
      </div>

      {loading ? (
        // Pre-sized skeletons: same heights as the real rows so the card
        // doesn't reflow when offerings land.
        <>
          <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width={62} height={20} radius={999} />
            <Skeleton width={96} height={22} radius={6} />
            <Skeleton width={72} height={12} radius={6} />
          </div>
          <div style={{ padding: '10px 8px' }}>
            <Skeleton width={80} height={18} radius={6} />
          </div>
        </>
      ) : (
        <>
          <SkuRow
            selected={selected && cycle === 'annual'}
            onPress={() => onSelect?.('annual')}
          >
            <span className="pw-sku-main">
              <span className="pw-badge-slot">
                {pct != null ? <span className="pw-badge">Save {pct}%</span> : null}
              </span>
              <span className="pw-sku-price-lg pw-price">
                {annualPkg?.product?.priceString ?? '–'}
                <span className="pw-sku-unit">/yr</span>
              </span>
              {perMonth ? <span className="pw-sku-note pw-price">{perMonth}</span> : null}
            </span>
          </SkuRow>
          <SkuRow
            selected={selected && cycle === 'monthly'}
            onPress={() => onSelect?.('monthly')}
          >
            <span className="pw-sku-main">
              <span className="pw-sku-price-sm pw-price">
                {monthlyPkg?.product?.priceString ?? '–'}
                <span className="pw-sku-unit">/mo</span>
              </span>
            </span>
          </SkuRow>
        </>
      )}
    </div>
  );
}
