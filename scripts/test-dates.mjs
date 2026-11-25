// Local-calendar YYYY-MM-DD for N days before today, matching how
// src/lib/peakStatus.js counts days off roast.
export function localDaysAgo(days) {
  const date = new Date(Date.now() - days * 86400000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
