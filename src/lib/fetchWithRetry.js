// Shared fetch utility with retry, timeout, and auth token injection
import { auth } from '../firebase';

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

// 60s accommodates Claude tool-use + long context windows. Short callers
// can still override via the `timeout` arg.
export async function fetchWithRetry({ url, body, retries = 2, timeout = 60000, serviceName = 'AI' }) {
  // Get fresh Firebase ID token for auth
  let token;
  try {
    token = await auth.currentUser?.getIdToken();
  } catch {
    // If token fetch fails, proceed without (server will reject if auth required)
  }

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

      // Subscription gate (Pro/Ultra required) or free tier quota exhausted.
      // These should NOT retry and should surface a typed error so callers can
      // trigger the paywall instead of showing a generic error toast.
      if (response.status === 403) {
        let data = null;
        try { data = await response.json(); } catch {}
        if (data?.error === 'subscription_required') {
          const err = new Error(data.message || 'Subscription required');
          err.code = 'subscription_required';
          err.tier = data.tier || 'pro'; // 'pro' | 'ultra'
          throw err;
        }
        if (data?.error === 'free_tier_exhausted') {
          const err = new Error(data.message || 'Free tier exhausted');
          err.code = 'free_tier_exhausted';
          err.feature = data.feature;
          err.used = data.used;
          err.limit = data.limit;
          throw err;
        }
        throw new Error(data?.error || `${serviceName} API error: 403`);
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
