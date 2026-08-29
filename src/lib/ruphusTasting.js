import { getAuth } from 'firebase/auth';
import { API_BASE } from './apiBase.js';

export async function saveRuphusTasting({ tastingId = crypto.randomUUID(), attemptId, coffeeId, sensory }) {
  const user = getAuth().currentUser;
  if (!user?.uid) throw new Error('Sign in to save tasting provenance.');
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE}/api/ruphus-tasting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tastingId, attemptId, coffeeId, sensory }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.message || 'Could not save tasting.'), { code: result.error || 'tasting_failed' });
  return result;
}
