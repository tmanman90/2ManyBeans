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
  if (typeof value !== 'object') return undefined;

  // Keep traversal iterative so hostile, circular evidence cannot consume the
  // call stack. Repeated references are represented as inert text; evidence is
  // explanatory context, never authority-bearing state.
  const seen = new WeakSet();
  const root = Array.isArray(value) ? [] : {};
  seen.add(value);
  const work = [{ source: value, target: root }];
  while (work.length) {
    const { source, target } = work.pop();
    for (const [rawKey, item] of Object.entries(source)) {
      if (!Array.isArray(source) && (SECRET_KEYS.test(rawKey) || AUTHORITY_KEYS.test(rawKey))) continue;
      const key = Array.isArray(source) ? target.length : cleanString(rawKey);
      if (item && typeof item === 'object') {
        if (seen.has(item)) {
          target[key] = '[Circular]';
          continue;
        }
        seen.add(item);
        target[key] = Array.isArray(item) ? [] : {};
        work.push({ source: item, target: target[key] });
      } else {
        target[key] = typeof item === 'string' ? cleanString(item)
          : (typeof item === 'number' || typeof item === 'boolean' || item == null ? item : undefined);
      }
    }
  }
  return root;
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
