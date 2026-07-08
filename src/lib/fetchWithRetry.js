// Shared fetch utility with retry, timeout, and auth token injection

// Redemption-code reason codes. When any of these land in a 403/429
// response body, surface them as typed err.code so the Settings redeem
// row can render per-reason copy inline.
// Keep in sync with: api/redeem-code.js STATUS, SettingsPage.jsx REDEEM_COPY.
const REDEMPTION_REASONS = new Set([
  'invalid_code',
  'invalid_input',
  'already_redeemed',
  'has_active_subscription',
  'email_not_verified',
  'rate_limited',
]);

const FRIENDLY_ERRORS = {
  400: 'Invalid request. Try again, or contact support if it keeps happening.',
  401: 'Your session expired. Please sign in again.',
  429: 'AI is rate-limited, please wait a moment and try again',
  500: 'The AI service hit an error. Try again in a sec.',
  502: 'The AI service is unreachable. Try again shortly.',
  503: 'AI service is temporarily unavailable, please try again shortly',
  504: 'The request took too long. Try again with a shorter message.',
  529: 'AI service is temporarily busy, please try again in a moment',
};

export async function getAuthToken() {
  try {
    const { auth } = await import('../firebase');
    return await auth.currentUser?.getIdToken();
  } catch {
    // If token fetch fails, proceed without (server will reject if auth required)
    return undefined;
  }
}

export function parseTypedError(data, status) {
  if (status === 401 && data?.error === 'reauth_required') {
    const err = new Error(data.message || 'Please reauthenticate to continue.');
    err.code = 'reauth_required';
    return err;
  }

  if (status === 403) {
    if (data?.error === 'subscription_required') {
      const err = new Error(data.message || 'Subscription required');
      err.code = 'subscription_required';
      err.tier = data.tier || 'pro'; // 'pro' | 'ultra'
      return err;
    }
    if (data?.error === 'free_tier_exhausted') {
      const err = new Error(data.message || 'Free tier exhausted');
      err.code = 'free_tier_exhausted';
      err.feature = data.feature;
      err.used = data.used;
      err.limit = data.limit;
      return err;
    }
    // Redemption reason codes (403 variants). Thin passthrough —
    // friendly copy lives in the consumer (SettingsPage redeem row).
    if (data?.error && REDEMPTION_REASONS.has(data.error)) {
      const err = new Error(data.error);
      err.code = data.error;
      return err;
    }
  }

  if (status === 429 && data?.error && REDEMPTION_REASONS.has(data.error)) {
    const err = new Error(data.error);
    err.code = data.error;
    return err;
  }

  return null;
}

// 60s accommodates Claude tool-use + long context windows. Short callers
// can still override via the `timeout` arg.
export async function fetchWithRetry({ url, body, retries = 2, timeout = 60000, serviceName = 'AI' }) {
  // Get fresh Firebase ID token for auth
  const token = await getAuthToken();

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        return response.json();
      }

      // Some authenticated destructive flows need typed 401 errors. Parse
      // those before FRIENDLY_ERRORS turns every 401 into generic session copy.
      if (response.status === 401) {
        let data = null;
        try { data = await response.json(); } catch { /* ignore non-JSON error bodies */ }
        const typed = parseTypedError(data, response.status);
        if (typed) throw typed;
        throw new Error(FRIENDLY_ERRORS[401]);
      }

      // Subscription gate (Pro/Ultra required) or free tier quota exhausted.
      // These should NOT retry and should surface a typed error so callers can
      // trigger the paywall instead of showing a generic error toast.
      if (response.status === 403) {
        let data = null;
        try { data = await response.json(); } catch { /* ignore non-JSON error bodies */ }
        const typed = parseTypedError(data, response.status);
        if (typed) throw typed;
        throw new Error(data?.error || `${serviceName} API error: 403`);
      }

      // Rate-limit reason code (429). Peek at the body before the retry
      // block so typed redemption 429s surface as err.code instead of
      // falling through to the generic "AI is rate-limited" copy. AI
      // proxy 429s never have { error: 'rate_limited' } in the body so
      // they fall through safely to the retry/FRIENDLY_ERRORS path.
      if (response.status === 429) {
        let data = null;
        try { data = await response.json(); } catch { /* ignore non-JSON error bodies */ }
        const typed = parseTypedError(data, response.status);
        if (typed) throw typed;
        // Fall through to retry or FRIENDLY_ERRORS below.
      }

      // Retry on transient errors
      if ([429, 529, 503].includes(response.status) && attempt < retries) {
        lastError = response.status;
        continue;
      }

      const friendly = FRIENDLY_ERRORS[response.status];
      if (friendly) throw new Error(friendly);

      // Try to get server error detail. If the response body isn't valid JSON
      // (HTML error page, empty body, etc.), fall back to a generic message
      // rather than trying to match on parser error strings, which differ
      // across engines and are unreliable.
      let serverData = null;
      try {
        serverData = await response.json();
      } catch { /* not JSON, fall through to generic */ }
      throw new Error(serverData?.error || `${serviceName} API error: ${response.status}`);
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw e;
    }
  }

  const friendly = FRIENDLY_ERRORS[lastError];
  throw new Error(friendly || `${serviceName} API error: ${lastError}`);
}
