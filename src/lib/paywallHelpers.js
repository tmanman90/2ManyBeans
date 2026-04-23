export function handlePaywallError(err, openPaywall) {
  if (err?.code === 'free_tier_exhausted') {
    openPaywall({ feature: 'scan_cap', promote: 'pro' });
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
