// `feature` must come from the caller, not be inferred here: a
// free_tier_exhausted error can come from any metered quota (scan, product
// shot, chat, recipe...), and this helper has no way to know which one ran
// out. Hardcoding 'scan_cap' made every quota-exhausted response say
// "You've used your free scans" regardless of the actual feature.
export function handlePaywallError(err, openPaywall, feature = 'generic') {
  if (err?.code === 'free_tier_exhausted') {
    openPaywall({ feature, promote: 'pro' });
    return true;
  }
  if (err?.code === 'subscription_required') {
    openPaywall({
      feature: 'generic',
      promote: err.tier === 'ultra' ? 'ultra' : 'pro',
    });
    return true;
  }
  return false;
}
