// When a celebration sheet should close. The clip sets the pace: the sheet
// stays up for `afterPlayMs` once the clip starts playing (like the Rotation
// tab's bag-finished sheet), but never past `maxMs` from when it appeared, so a
// slow or failed clip cannot leave it stuck. Times are Date.now() values.
export function celebrationCloseAt({ shownAt, playedAt }, { afterPlayMs, maxMs }) {
  const cap = shownAt + maxMs;
  return playedAt == null ? cap : Math.min(playedAt + afterPlayMs, cap);
}
