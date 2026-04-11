// Shared text formatting helpers.
//
// stripMarkdown: belt-and-suspenders sanitizer for LLM output that renders in
// plain-text chat bubbles. System prompts ALREADY forbid markdown, but Claude
// and GPT occasionally ignore the instruction and emit `**bold**` or `*italic*`
// anyway. Rather than chasing model behavior, we strip the paired markers at
// render time.
//
// Design notes:
// - Only strips PAIRED markers with content between them. Lone asterisks and
//   unpaired `**` are left intact so prose like "2**2" or "A * B" stays readable.
// - Handles bold first (`**x**`), then italic (`*x*`), with negative lookahead
//   so the italic pass doesn't re-process leftovers from a ``** pair.
// - Also strips leading `#` header syntax at the start of a line.
export const stripMarkdown = (t = '') => t
  .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
  .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1$2')
  .replace(/^#{1,6}\s+/gm, '');
