import { palateLevel } from './palate.js';

const PALATE_AXES = ['fragranceAroma', 'acidity', 'sweetness', 'body', 'flavor', 'balance'];

function sanitize(str, maxLen = 100) {
  const base = (str || '').slice(0, maxLen).replace(/[^\w .\-',():/]/g, '');
  return base.replace(/-{3,}/g, '--');
}

function numOrNull(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function buildPalateSummary(tastings = []) {
  if (!Array.isArray(tastings) || tastings.length === 0) return '';

  const level = palateLevel(tastings);
  const lines = [`Level ${level.level}: ${sanitize(level.title, 40)} (${level.cups} cups logged)`];

  const axisMeans = PALATE_AXES.map(axis => {
    const values = tastings
      .map(t => numOrNull(t?.tastingScores?.[axis]))
      .filter(n => n !== null);
    if (values.length < 3) return null;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return `${axis} ${mean.toFixed(1)}`;
  }).filter(Boolean);
  if (axisMeans.length) lines.push(`Taste trend: ${axisMeans.join(', ')}`);

  const descriptorCounts = new Map();
  for (const tasting of tastings) {
    const descriptor = sanitize(tasting?.oneWord, 50).trim();
    if (!descriptor) continue;
    const key = descriptor.toLowerCase();
    const current = descriptorCounts.get(key);
    descriptorCounts.set(key, {
      label: current?.label || descriptor,
      count: (current?.count || 0) + 1,
    });
  }
  const recurring = [...descriptorCounts.values()]
    .filter(item => item.count > 1)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3)
    .map(item => item.label);
  if (recurring.length) lines.push(`Recurring words: ${recurring.join(', ')}`);

  return lines.join('\n');
}
