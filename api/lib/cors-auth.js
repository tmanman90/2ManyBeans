// Shared CORS + Firebase Auth for all API proxies
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Lazy-init Firebase Admin
function getFirebaseAdmin() {
  if (getApps().length === 0) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (sa) {
      initializeApp({ credential: cert(JSON.parse(sa)) });
    } else {
      console.warn('FIREBASE_SERVICE_ACCOUNT not set -- API auth is DISABLED. Set this env var in production.');
      return null;
    }
  }
  return getAuth();
}

const EXACT_ORIGINS = [
  'https://2manybeans.vercel.app',
  'capacitor://localhost',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (EXACT_ORIGINS.includes(origin)) return true;
  // Allow http://localhost with any port (dev + Capacitor)
  try {
    const url = new URL(origin);
    if (url.protocol === 'http:' && url.hostname === 'localhost') return true;
  } catch {
    // Invalid URL
  }
  return false;
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function verifyAuth(req) {
  const auth = getFirebaseAdmin();
  if (!auth) return null; // No service account = dev mode, skip auth

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization header');
    err.status = 401;
    throw err;
  }

  const token = header.slice(7);
  try {
    return await auth.verifyIdToken(token);
  } catch (e) {
    const err = new Error('Invalid or expired token');
    err.status = 401;
    throw err;
  }
}

export function withCorsAuth(handler) {
  return async (req, res) => {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    let decodedToken;
    try {
      decodedToken = await verifyAuth(req);
    } catch (error) {
      if (error.status === 401) {
        return res.status(401).json({ error: error.message });
      }
      console.error('Auth verification error:', error);
      return res.status(500).json({ error: 'Internal auth error' });
    }

    return handler(req, res, decodedToken);
  };
}
