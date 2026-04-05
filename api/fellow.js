// Vercel serverless endpoint for Fellow account connection
// Actions: connect (validate + encrypt + store) and disconnect (delete)
// Credentials stored encrypted in users/{uid}/secrets/fellow via Admin SDK
// Profile doc gets fellow.connected + fellow.email for client-side reads
import { withCorsAuth, getDb } from './lib/cors-auth.js';
import { encrypt } from './lib/crypto.js';
import { FieldValue } from 'firebase-admin/firestore';

const FELLOW_API = 'https://l8qtmnc692.execute-api.us-west-2.amazonaws.com/v1';

async function handleConnect(req, res, uid) {
  const { email, password } = req.body || {};

  // Input validation
  if (!email || typeof email !== 'string' || email.length > 320) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  if (!password || typeof password !== 'string' || password.length > 256) {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Fellow API is case-sensitive on email for device lookup
  const normalizedEmail = email.trim().toLowerCase();

  // Validate credentials with Fellow API
  let fellowAuth;
  try {
    const authRes = await fetch(`${FELLOW_API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
    if (!authRes.ok) {
      const status = authRes.status;
      if (status === 401 || status === 403) {
        return res.status(401).json({ error: 'Invalid Fellow email or password' });
      }
      return res.status(502).json({ error: `Fellow login failed (${status})` });
    }
    fellowAuth = await authRes.json();
  } catch (err) {
    console.error('Fellow auth error:', err.message);
    return res.status(502).json({ error: 'Could not reach Fellow servers' });
  }

  if (!fellowAuth.accessToken) {
    return res.status(502).json({ error: 'Fellow login succeeded but no token returned' });
  }

  // Encrypt credentials as single JSON blob
  const encCredentials = encrypt(JSON.stringify({ email: normalizedEmail, password }));

  // Atomic write: secrets doc + profile doc
  const db = getDb();
  const batch = db.batch();

  const secretsRef = db.doc(`users/${uid}/secrets/fellow`);
  batch.set(secretsRef, {
    encCredentials,
    keyVersion: 1,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const profileRef = db.doc(`users/${uid}`);
  batch.update(profileRef, {
    'fellow.connected': true,
    'fellow.email': normalizedEmail,
    'fellow.connectedAt': FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // Log without credentials
  console.log(`Fellow connected: uid=${uid}, email=${normalizedEmail}`);

  return res.status(200).json({ connected: true, email: normalizedEmail });
}

async function handleDisconnect(req, res, uid) {
  const db = getDb();
  const batch = db.batch();

  const secretsRef = db.doc(`users/${uid}/secrets/fellow`);
  batch.delete(secretsRef);

  const profileRef = db.doc(`users/${uid}`);
  batch.update(profileRef, {
    'fellow.connected': false,
    'fellow.email': FieldValue.delete(),
    'fellow.connectedAt': FieldValue.delete(),
  });

  await batch.commit();

  console.log(`Fellow disconnected: uid=${uid}`);

  return res.status(200).json({ connected: false });
}

export default withCorsAuth(async (req, res, decodedToken) => {
  if (!decodedToken?.uid) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const uid = decodedToken.uid;
  const action = req.query?.action || new URL(req.url, 'http://localhost').searchParams.get('action');

  try {
    switch (action) {
      case 'connect':
        return await handleConnect(req, res, uid);
      case 'disconnect':
        return await handleDisconnect(req, res, uid);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}. Use ?action=connect or ?action=disconnect` });
    }
  } catch (err) {
    console.error(`Fellow ${action} error:`, err.message);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});
