// paywallFlagOn: whether in-app (non-onboarding) paywall triggers should
// route to the new PaywallRoast full-screen flow instead of the classic
// PaywallSheet.
//
// This is a localStorage flag rather than a build-time constant so a
// device-side regression can be rolled back instantly (flip '0' and
// reload) — no OTA push, no waiting on Capgo propagation to affected
// devices.
export function paywallFlagOn() {
  try {
    const o = localStorage.getItem('pw_roast');
    if (o === '0') return false;
    if (o === '1') return true;
  } catch {}
  return true;
}
