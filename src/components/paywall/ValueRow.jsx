// Step 1 value row + the shared icon renderer for the paywall icon set.
//
// PW_ICONS entries are stroke-only path sets (circles pre-converted to arc
// paths), so this one renderer covers every icon in the paywall: value-row
// discs, compare-matrix checks, and the selected-SKU check circle. Color is
// inherited from the parent (.pw-disc sets gold, .pw-mx-cell sets text).

import { PW_ICONS } from './paywallCopy';

export function PwIcon({ name }) {
  const icon = PW_ICONS[name];
  if (!icon) return null;
  return (
    <svg
      viewBox={icon.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={icon.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

// A bare row on the raw canvas — no card, no border, no fill (mockup rule).
// `delay` feeds the entrance stagger via --pw-d.
export default function ValueRow({ icon, label, sub, delay = 0 }) {
  return (
    <div className="pw-vrow pw-in" style={{ '--pw-d': `${delay}ms` }}>
      <div className="pw-disc">
        <PwIcon name={icon} />
      </div>
      <div>
        <h3>{label}</h3>
        <p>{sub}</p>
      </div>
    </div>
  );
}
