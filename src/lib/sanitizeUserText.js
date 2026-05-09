// Normalize user-supplied strings before they enter Firestore or LLM prompts.
// Strips bidi overrides, zero-width chars, control chars, then trims and caps at 50.
// Used for displayName and anywhere user input is templated into a system prompt.
export function sanitizeUserText(s) {
  if (typeof s !== 'string') return '';
  return s
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex -- control characters are intentionally stripped from user text.
    .replace(/[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 50);
}
