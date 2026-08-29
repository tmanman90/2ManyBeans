import { canonicalJson } from './contracts.js';

const SECRET_KEYS = /token|secret|authorization|api[-_]?key|password|cookie|credential/i;
const AUTHORITY_KEYS = /receipt|action|apply|brew.?once|undo|fellow|physical|machine|profile.?id/i;
const MARKER = /(?:---|```|<script|javascript:)/gi;

function cleanString(value) {
  return String(value).replace(MARKER, '').replace(/\s+/g, ' ').trim();
}

function clean(value) {
  if (typeof value === 'string') return cleanString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => clean(item));
  if (typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEYS.test(key) && !AUTHORITY_KEYS.test(key))
    .map(([key, item]) => [cleanString(key), clean(item)]));
}

export function sanitizeEvidence(value, { maxBytes } = {}) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error('evidence byte cap must be configured');
  const sanitized = clean(value);
  let serialized = canonicalJson(sanitized);
  const bytes = new TextEncoder().encode(serialized);
  if (bytes.byteLength > maxBytes) {
    serialized = new TextDecoder().decode(bytes.slice(0, maxBytes));
    return { value: { truncated: true, preview: serialized }, truncated: true, bytes: new TextEncoder().encode(serialized).byteLength };
  }
  return { value: sanitized, truncated: false, bytes: bytes.byteLength };
}

export function sanitizeEvidenceBlock(value, options = {}) {
  return JSON.stringify(sanitizeEvidence(value, options).value);
}

export function containsAuthorityClaim(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return /(?:receipt|action[_ -]?id|apply(?:ed)?|brew once|undo|fellow|physical machine)/i.test(serialized || '');
}
