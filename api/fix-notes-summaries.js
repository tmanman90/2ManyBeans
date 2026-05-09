// One-off migration: generate notesSummary for all existing beans.
// Hit once while authenticated, then delete this file.
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withCorsAuth, getDb } from './_lib/cors-auth.js';

const DEFAULT_ADMIN_EMAIL = 'talmeltzer@gmail.com';

function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAIL)
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

let genAI;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
}

async function summarize(bagNotes) {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: 'You return ONLY a final short phrase. Never show reasoning, thinking, or explanation. Never use prefixes like THINK:, THOUGHTS:, ANSWER:. Output the answer directly.',
  });
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: `Summarize these coffee tasting notes as 3-4 comma-separated descriptors (max 40 chars total). Format: "word, word, word" - always use commas between descriptors, lowercase, no period. Output only the phrase. Notes: ${bagNotes}` }],
    }],
    generationConfig: { maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
  });
  let text = (result.response.text?.() || '').trim();
  // Strip any leaked reasoning prefixes
  text = text.replace(/^(THINK|THOUGHTS?|ANSWER|REASONING)[:\s]*/i, '').trim();
  // Take only the first line (in case multi-line response)
  text = text.split('\n')[0].trim();
  // Truncate at 40 chars, break at word boundary
  if (text.length > 40) {
    const cut = text.slice(0, 40);
    const lastSpace = cut.lastIndexOf(' ');
    text = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  }
  // Reject too-short results (likely truncated garbage)
  if (text.length < 4) return null;
  return text || null;
}

export default withCorsAuth(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  if (!uid) return res.status(401).json({ error: 'Auth required' });

  if (process.env.ENABLE_FIX_NOTES_SUMMARIES !== 'true') {
    return res.status(410).json({ error: 'migration_disabled' });
  }

  const email = decodedToken.email?.toLowerCase();
  if (!email || !getAdminEmails().has(email)) {
    return res.status(403).json({ error: 'admin_required' });
  }

  const db = getDb();
  const beansSnap = await db.collection('users').doc(uid).collection('beans').get();

  const results = [];
  for (const doc of beansSnap.docs) {
    const bean = doc.data();

    if (!bean.bagNotes || bean.bagNotes === '(not logged)') {
      results.push({ id: doc.id, name: bean.name, status: 'skipped (no notes)' });
      continue;
    }

    // Note: this migration re-processes all beans with notes to overwrite any
    // broken summaries from earlier migration runs.

    try {
      const summary = await summarize(bean.bagNotes);
      if (!summary) {
        results.push({ id: doc.id, name: bean.name, status: 'skipped (empty summary)' });
        continue;
      }

      await db.collection('users').doc(uid).collection('beans').doc(doc.id).update({
        notesSummary: summary,
        updatedAt: new Date(),
      });

      results.push({ id: doc.id, name: bean.name, status: 'fixed', summary });
    } catch (err) {
      results.push({ id: doc.id, name: bean.name, status: `error: ${err.message}` });
    }
  }

  return res.status(200).json({ total: results.length, results });
});
