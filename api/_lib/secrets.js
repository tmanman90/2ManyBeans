export function normalizeSecret(value) {
  if (typeof value !== 'string') return '';

  let normalized = value.trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  // Vercel env pulls can preserve escaped line endings from pasted values.
  // Headers cannot carry those suffixes, so strip them before comparisons.
  normalized = normalized
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .trim();

  if (normalized.startsWith('Bearer ')) {
    normalized = normalized.slice(7).trim();
  }

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  return normalized;
}
