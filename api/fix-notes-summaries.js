// One-off migration: generate notesSummary for all existing beans.
// Hit once while authenticated, then delete this file.
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withCorsAuth, getDb } from './lib/cors-auth.js';

let genAI;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
}

async function summarize(bagNotes) {
  const client = getClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: `Summarize these coffee tasting notes into a concise phrase under 40 characters. Return ONLY the summary, no quotes or explanation: ${bagNotes}` }],
    }],
    generationConfig: { maxOutputTokens: 100 },
  });
  const text = result.response.text?.() || '';
  return text.trim() || null;
}

export default withCorsAuth(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  if (!uid) return res.status(401).json({ error: 'Auth required' });

  const db = getDb();
  const beansSnap = await db.collection('users').doc(uid).collection('beans').get();

  const results = [];
  for (const doc of beansSnap.docs) {
    const bean = doc.data();

    if (!bean.bagNotes || bean.bagNotes === '(not logged)') {
      results.push({ id: doc.id, name: bean.name, status: 'skipped (no notes)' });
      continue;
    }

    if (bean.notesSummary) {
      results.push({ id: doc.id, name: bean.name, status: 'skipped (already has summary)' });
      continue;
    }

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
