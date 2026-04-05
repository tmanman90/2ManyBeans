// Shared fetch utility with retry, timeout, and auth token injection
import { auth } from '../firebase';

const FRIENDLY_ERRORS = {
  429: 'AI is rate-limited, please wait a moment and try again',
  529: 'AI service is temporarily busy, please try again in a moment',
  503: 'AI service is temporarily unavailable, please try again shortly',
};

export async function fetchWithRetry({ url, body, retries = 2, timeout = 30000, serviceName = 'AI' }) {
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

      // Retry on transient errors
      if ([429, 529, 503].includes(response.status) && attempt < retries) {
        lastError = response.status;
        continue;
      }

      const friendly = FRIENDLY_ERRORS[response.status];
      if (friendly) throw new Error(friendly);

      // Try to get server error detail
      try {
        const data = await response.json();
        throw new Error(data.error || `${serviceName} API error: ${response.status}`);
      } catch (e) {
        if (e.message && e.message !== 'Unexpected token') throw e;
        throw new Error(`${serviceName} API error: ${response.status}`);
      }
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
