// Purchase/restore feedback toast. CSS-only on purpose: the old sheet's
// framer `popIn` (opacity 0 -> animate 1) is exactly the pattern that has
// shipped invisible UI in WKWebView when the animate never fires. The
// .pw-toast base rule is visible-by-default; the fade keyframe only runs
// under prefers-reduced-motion: no-preference.

export default function PaywallToast({ message }) {
  if (!message) return null;
  return (
    <div className="pw-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
