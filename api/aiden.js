// Vercel serverless proxy for Fellow Aiden API
// Keeps FELLOW_EMAIL / FELLOW_PASSWORD server-side only
// Flow: auth -> device -> create profile -> share (brew.link) -> delete temp profile
// NEVER touches existing profiles -- if device is full, returns error gracefully
import { withCorsAuth } from './lib/cors-auth.js';

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
  const res = await fetch(`${FELLOW_API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const error = new Error(`Fellow ${path} failed (${res.status}): ${body}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export default withCorsAuth(async (req, res) => {
  const { FELLOW_EMAIL, FELLOW_PASSWORD } = process.env;
  if (!FELLOW_EMAIL || !FELLOW_PASSWORD) {
    return res.status(500).json({ error: 'Fellow credentials not configured' });
  }

  try {
    const profile = req.body;

    const errors = validateProfile(profile);
    if (errors.length > 0) {
      return res.status(400).json({ error: `Invalid profile: ${errors.join('; ')}` });
    }

    // 1. Authenticate
    const auth = await fellowFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: FELLOW_EMAIL, password: FELLOW_PASSWORD }),
    });
    const token = auth.accessToken;
    if (!token) throw new Error('No accessToken in auth response');
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Get first Aiden device
    const devices = await fellowFetch('/devices', { headers: authHeaders });
    const deviceList = devices.devices || devices;
    const device = Array.isArray(deviceList) ? deviceList[0] : null;
    if (!device) {
      return res.status(404).json({ error: 'No Aiden brewer found on your Fellow account' });
    }
    const deviceId = device.id || device.deviceId;

    // 3. Create temp profile on device
    let created;
    try {
      created = await fellowFetch(`/devices/${deviceId}/profiles`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(profile),
      });
    } catch (createErr) {
      if (createErr.status === 400) {
        console.error('Profile create 400:', createErr.message);
        return res.status(409).json({
          error: `Fellow rejected the profile (400): ${createErr.message}`,
        });
      }
      throw createErr;
    }
    const profileId = created.id || created.profileId;

    // 4. Share profile -> get brew.link
    const shared = await fellowFetch(`/devices/${deviceId}/profiles/${profileId}/share`, {
      method: 'POST',
      headers: authHeaders,
    });
    const link = shared.link || shared.url || shared.shareUrl;

    // 5. Delete the temp profile we just created -- keep Aiden clean
    try {
      await fellowFetch(`/devices/${deviceId}/profiles/${profileId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
    } catch {
      console.warn('Could not clean up temp profile from device');
    }

    return res.status(200).json({
      link,
      profileId,
      title: profile.title,
    });
  } catch (error) {
    console.error('Fellow API error:', error);
    return res.status(502).json({ error: error.message || 'Failed to push profile to Fellow' });
  }
});
