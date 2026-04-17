// Vercel serverless proxy for Fellow Aiden API
// Multi-user: reads per-user credentials from Firestore secrets, falls back to relay
// Flow: auth -> device -> create profile -> share (brew.link) -> delete temp profile
// NEVER touches existing profiles -- if device is full, returns error gracefully
import { withCorsAuthUltra, getDb } from './_lib/cors-auth.js';
import { decrypt } from './_lib/crypto.js';
import { FieldValue } from 'firebase-admin/firestore';

const FELLOW_API = 'https://l8qtmnc692.execute-api.us-west-2.amazonaws.com/v1';

function validateProfile(profile) {
  const errors = [];
  const { ratio, bloomRatio, bloomDuration, bloomTemperature,
    ssPulsesNumber, ssPulsesInterval, ssPulseTemperatures,
    batchPulsesNumber, batchPulsesInterval, batchPulseTemperatures } = profile;

  if (ratio < 14 || ratio > 20) errors.push(`ratio ${ratio} out of range 14-20`);
  if (ratio % 0.5 !== 0) errors.push(`ratio ${ratio} must be in 0.5 steps`);

  if (profile.bloomEnabled) {
    if (bloomRatio < 1 || bloomRatio > 3) errors.push(`bloomRatio ${bloomRatio} out of range 1-3`);
    if (bloomDuration < 1 || bloomDuration > 120) errors.push(`bloomDuration ${bloomDuration} out of range 1-120`);
    if (bloomTemperature < 50 || bloomTemperature > 99) errors.push(`bloomTemperature ${bloomTemperature} out of range 50-99`);
  }

  const checkPulses = (label, enabled, num, interval, temps) => {
    if (!enabled) return;
    if (num < 1 || num > 10) errors.push(`${label} pulsesNumber ${num} out of range 1-10`);
    if (interval < 5 || interval > 60) errors.push(`${label} pulsesInterval ${interval} out of range 5-60`);
    if (temps.length !== num) errors.push(`${label} temps length ${temps.length} !== pulsesNumber ${num}`);
    temps.forEach((t, i) => {
      if (t < 50 || t > 99) errors.push(`${label} temp[${i}] ${t} out of range 50-99`);
    });
  };

  checkPulses('ss', profile.ssPulsesEnabled, ssPulsesNumber, ssPulsesInterval, ssPulseTemperatures || []);
  checkPulses('batch', profile.batchPulsesEnabled, batchPulsesNumber, batchPulsesInterval, batchPulseTemperatures || []);

  if (profile.title && profile.title.length > 50) errors.push(`title too long (${profile.title.length} > 50)`);

  return errors;
}

async function fellowFetch(path, options = {}) {
  const { timeout = 5000, ...fetchOpts } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${FELLOW_API}${path}`, {
      ...fetchOpts,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...fetchOpts.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const error = new Error(`Fellow ${path} failed (${res.status}): ${body}`);
      error.status = res.status;
      throw error;
    }
    const text = (await res.text().catch(() => '')).trim();
    if (!text) return {};
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

// Is this uid allowed to use the shared FELLOW_EMAIL/FELLOW_PASSWORD relay?
// Relay access means pushing profiles to the owner's personal Aiden brewer.
// Only the uid in FELLOW_RELAY_ALLOWED_UID may use it (typically: set to Tal's
// own uid in Vercel env vars). If unset, NOBODY can use the relay -- safe
// default for any new deployment.
function isRelayAllowed(uid) {
  const allowed = process.env.FELLOW_RELAY_ALLOWED_UID;
  return Boolean(allowed && uid && allowed === uid);
}

// Get Fellow credentials: try per-user secrets first, then relay env vars.
// Relay is only returned if the caller's uid is on the allowlist.
async function getFellowCredentials(uid) {
  const db = getDb();
  if (!db) {
    // Dev mode: no Firebase Admin, use relay (dev machines only)
    return { email: process.env.FELLOW_EMAIL, password: process.env.FELLOW_PASSWORD, source: 'relay' };
  }

  let secretsDoc;
  try {
    secretsDoc = await db.doc(`users/${uid}/secrets/fellow`).get();
  } catch (err) {
    // Firestore read failure: do NOT fall back to relay silently
    throw new Error(`Could not read Fellow credentials: ${err.message}`);
  }

  if (secretsDoc.exists) {
    const data = secretsDoc.data();
    if (data.encCredentials) {
      try {
        const { email, password } = JSON.parse(decrypt(data.encCredentials));
        return {
          email, password,
          source: 'user',
          // Cached token/device (optional, may not exist yet)
          cachedToken: data.fellowToken || null,
          cachedTokenExpiry: data.fellowTokenExpiry?.toMillis?.() || null,
          cachedDeviceId: data.fellowDeviceId || null,
          secretsRef: db.doc(`users/${uid}/secrets/fellow`),
        };
      } catch (decryptErr) {
        console.error(`Decryption failed for uid=${uid}:`, decryptErr.message);
        // Fall through to relay with invalid flag
        return { source: 'decrypt_failed' };
      }
    }
  }

  // No user credentials: use relay only if this uid is allowlisted.
  if (!isRelayAllowed(uid)) {
    const err = new Error('No Fellow credentials connected. Please connect in Settings.');
    err.status = 400;
    throw err;
  }
  const { FELLOW_EMAIL, FELLOW_PASSWORD } = process.env;
  if (!FELLOW_EMAIL || !FELLOW_PASSWORD) {
    throw new Error('Fellow relay credentials not configured');
  }
  return { email: FELLOW_EMAIL, password: FELLOW_PASSWORD, source: 'relay' };
}

// Cache Fellow token + device ID for faster subsequent pushes
async function cacheTokenAndDevice(secretsRef, token, deviceId) {
  if (!secretsRef) return;
  try {
    await secretsRef.update({
      fellowToken: token,
      fellowTokenExpiry: new Date(Date.now() + 30 * 60 * 1000), // 30min conservative TTL
      fellowDeviceId: deviceId,
    });
  } catch {
    // Non-critical: cache failure doesn't block the push
  }
}

// Clear cached token on auth failure
async function clearTokenCache(secretsRef) {
  if (!secretsRef) return;
  try {
    await secretsRef.update({
      fellowToken: FieldValue.delete(),
      fellowTokenExpiry: FieldValue.delete(),
    });
  } catch {
    // Non-critical
  }
}

async function pushWithCredentials(profile, creds) {
  let token = null;
  let deviceId = creds.cachedDeviceId || null;

  // Try cached token first. Use a 60s safety margin so a token that expires
  // seconds from now doesn't get used then immediately 401 -- forcing a
  // fresh auth in that case is cheaper than eating a round-trip failure.
  const TOKEN_SAFETY_MARGIN_MS = 60_000;
  if (creds.cachedToken && creds.cachedTokenExpiry && (Date.now() + TOKEN_SAFETY_MARGIN_MS) < creds.cachedTokenExpiry) {
    token = creds.cachedToken;
  }

  // Authenticate if no valid cached token
  if (!token) {
    const auth = await fellowFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    token = auth.accessToken;
    if (!token) throw new Error('No accessToken in auth response');
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Get device if not cached
  if (!deviceId) {
    const devices = await fellowFetch('/devices', { headers: authHeaders });
    const deviceList = devices.devices || devices;
    const device = Array.isArray(deviceList) ? deviceList[0] : null;
    if (!device) {
      throw Object.assign(new Error('No Aiden brewer found on your Fellow account'), { status: 404 });
    }
    deviceId = device.id || device.deviceId;
  }

  // Cache token + device for next time (non-blocking)
  cacheTokenAndDevice(creds.secretsRef, token, deviceId);

  // Create temp profile on device (auto-delete duplicate if leftover from previous push)
  let created;
  try {
    created = await fellowFetch(`/devices/${deviceId}/profiles`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(profile),
    });
  } catch (createErr) {
    if (createErr.status === 400 && createErr.message && createErr.message.includes('already exists')) {
      // Stale profile from a previous push that failed to clean up -- delete it and retry
      console.warn('Duplicate profile detected, cleaning up and retrying...');
      try {
        const existing = await fellowFetch(`/devices/${deviceId}/profiles`, { headers: authHeaders });
        const profiles = existing.profiles || existing;
        const stale = Array.isArray(profiles) && profiles.find(p => p.title === profile.title || p.name === profile.title);
        if (stale) {
          const staleId = stale.id || stale.profileId;
          await fellowFetch(`/devices/${deviceId}/profiles/${staleId}`, { method: 'DELETE', headers: authHeaders });
        }
        created = await fellowFetch(`/devices/${deviceId}/profiles`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(profile),
        });
      } catch (retryErr) {
        console.error('Retry after duplicate cleanup failed:', retryErr.message);
        throw Object.assign(new Error(`Fellow rejected the profile after cleanup: ${retryErr.message}`), { status: 409 });
      }
    } else if (createErr.status === 400) {
      console.error('Profile create 400:', createErr.message);
      throw Object.assign(new Error(`Fellow rejected the profile (400): ${createErr.message}`), { status: 409 });
    } else {
      throw createErr;
    }
  }
  const profileId = created.id || created.profileId;

  // Share profile -> get brew.link
  const shared = await fellowFetch(`/devices/${deviceId}/profiles/${profileId}/share`, {
    method: 'POST',
    headers: authHeaders,
  });
  const link = shared.link || shared.url || shared.shareUrl;

  // Delete the temp profile -- keep device clean
  try {
    await fellowFetch(`/devices/${deviceId}/profiles/${profileId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
  } catch {
    console.warn('Could not clean up temp profile from device');
  }

  return { link, profileId, title: profile.title };
}

// Push a pre-generated brew profile directly to the user's Fellow Aiden
// account via Fellow's API. Recipe GENERATION (which produces the profile
// this endpoint receives) runs through api/openai.js and is Pro-gated.
// This endpoint handles only the push/share-link step, which requires the
// Ultra tier because it consumes Fellow API quota and is the hardware-
// integration feature that differentiates Ultra from Pro.
export default withCorsAuthUltra(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;

  try {
    const profile = req.body;
    const errors = validateProfile(profile);
    if (errors.length > 0) {
      return res.status(400).json({ error: `Invalid profile: ${errors.join('; ')}` });
    }

    // Get credentials (per-user or relay)
    let creds;
    try {
      creds = await getFellowCredentials(uid);
    } catch (credsErr) {
      if (credsErr.status === 400) {
        return res.status(400).json({ error: credsErr.message });
      }
      throw credsErr;
    }

    // Decryption failed: return error + try relay fallback ONLY for the
    // allowlisted relay uid. For everyone else, the relay would push to the
    // owner's personal Aiden -- refuse and surface a reconnect prompt.
    if (creds.source === 'decrypt_failed') {
      if (isRelayAllowed(uid)) {
        try {
          const { FELLOW_EMAIL, FELLOW_PASSWORD } = process.env;
          if (FELLOW_EMAIL && FELLOW_PASSWORD) {
            const relayCreds = { email: FELLOW_EMAIL, password: FELLOW_PASSWORD, source: 'relay' };
            const result = await pushWithCredentials(profile, relayCreds);
            return res.status(200).json({ ...result, usedRelay: true, fellowCredentialsInvalid: true });
          }
        } catch {
          // Relay also failed
        }
      }
      return res.status(500).json({ error: 'Your Fellow credentials could not be read. Please reconnect in Settings.' });
    }

    // Try push with the resolved credentials
    try {
      const result = await pushWithCredentials(profile, creds);
      return res.status(200).json({ ...result, usedRelay: creds.source === 'relay' });
    } catch (pushErr) {
      // If user credentials failed with 401/403, try relay fallback -- again,
      // only for the allowlisted uid. Everyone else gets a reconnect prompt.
      if (creds.source === 'user' && (pushErr.status === 401 || pushErr.status === 403)) {
        console.warn(`Fellow auth failed for uid=${uid}, clearing token cache`);
        clearTokenCache(creds.secretsRef);

        if (isRelayAllowed(uid)) {
          const { FELLOW_EMAIL, FELLOW_PASSWORD } = process.env;
          if (FELLOW_EMAIL && FELLOW_PASSWORD) {
            try {
              const relayCreds = { email: FELLOW_EMAIL, password: FELLOW_PASSWORD, source: 'relay' };
              const result = await pushWithCredentials(profile, relayCreds);
              return res.status(200).json({ ...result, usedRelay: true, fellowCredentialsInvalid: true });
            } catch (relayErr) {
              console.error('Relay fallback also failed:', relayErr.message);
            }
          }
        }
        return res.status(401).json({ error: 'Your Fellow credentials are invalid. Please reconnect in Settings.' });
      }

      // Surface specific errors
      if (pushErr.status === 404) {
        return res.status(404).json({ error: pushErr.message });
      }
      if (pushErr.status === 409) {
        return res.status(409).json({ error: pushErr.message });
      }
      throw pushErr;
    }
  } catch (error) {
    console.error('Fellow API error:', error.message);
    return res.status(502).json({ error: error.message || 'Failed to push profile to Fellow' });
  }
});
