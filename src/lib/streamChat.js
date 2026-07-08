import { Capacitor } from '@capacitor/core';
import { getAuthToken, parseTypedError } from './fetchWithRetry.js';

export const MARKER_FAMILIES = [
  { key: 'beanScan', open: '---BEAN_SCAN---', close: '---END_SCAN---' },
  { key: 'recipeCard', open: '---RECIPE_CARD---', close: '---END_RECIPE---' },
  { key: 'needsSearch', open: '---NEEDS_SEARCH---', close: '---END_SEARCH---' },
];

let bufferedTransport = false;

function markerTokens() {
  return MARKER_FAMILIES.flatMap(family => [family.open, family.close]);
}

function trailingPartialToken(text) {
  let best = null;
  if (markerTokens().some(token => text.endsWith(token))) return best;
  for (const token of markerTokens()) {
    const max = Math.min(token.length - 1, text.length);
    for (let len = 1; len <= max; len += 1) {
      if (text.endsWith(token.slice(0, len)) && (!best || len > best.length)) {
        best = { length: len, token };
      }
    }
  }
  return best;
}

function findUnclosedMarker(text) {
  let earliest = null;
  for (const family of MARKER_FAMILIES) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const openIdx = text.indexOf(family.open, searchFrom);
      if (openIdx === -1) break;
      const closeIdx = text.indexOf(family.close, openIdx + family.open.length);
      if (closeIdx === -1) {
        if (!earliest || openIdx < earliest.index) {
          earliest = { index: openIdx, family };
        }
        break;
      }
      searchFrom = closeIdx + family.close.length;
    }
  }
  return earliest;
}

function hasTrailingUnpairedBold(text) {
  if (!text.endsWith('**')) return false;
  const matches = text.match(/\*\*/g);
  return Boolean(matches && matches.length % 2 === 1);
}

export function holdBackScan(fullText) {
  const text = String(fullText || '');
  let holdStart = text.length;

  const unclosed = findUnclosedMarker(text);
  if (unclosed) holdStart = Math.min(holdStart, unclosed.index);

  const partial = trailingPartialToken(text);
  if (partial) holdStart = Math.min(holdStart, text.length - partial.length);

  if (hasTrailingUnpairedBold(text)) {
    holdStart = Math.min(holdStart, text.length - 2);
  }

  return {
    display: text.slice(0, holdStart),
    held: text.slice(holdStart),
  };
}

export function resolveTerminal(fullText) {
  let text = String(fullText || '');
  const dropped = [];
  const unclosed = findUnclosedMarker(text);

  if (unclosed) {
    text = text.slice(0, unclosed.index);
    dropped.push(unclosed.family.key);
  }

  const partial = trailingPartialToken(text);
  if (partial) {
    const matchingFamily = MARKER_FAMILIES.find(family =>
      family.open.startsWith(text.slice(-partial.length)) || family.close.startsWith(text.slice(-partial.length))
    );
    if (matchingFamily && !dropped.includes(matchingFamily.key)) dropped.push(matchingFamily.key);
    text = text.slice(0, -partial.length);
  }

  return { text, dropped };
}

export function wasBufferedTransport() {
  return bufferedTransport;
}

function makeError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

async function parseErrorBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFromStatus(data, status, serviceName = 'Claude') {
  const typed = parseTypedError(data, status);
  if (typed) return typed;

  const friendly = {
    400: 'Invalid request. Try again, or contact support if it keeps happening.',
    401: 'Your session expired. Please sign in again.',
    429: 'AI is rate-limited, please wait a moment and try again',
    500: 'The AI service hit an error. Try again in a sec.',
    502: 'The AI service is unreachable. Try again shortly.',
    503: 'AI service is temporarily unavailable, please try again shortly',
    504: 'The request took too long. Try again with a shorter message.',
    529: 'AI service is temporarily busy, please try again in a moment',
  }[status];

  return new Error(friendly || data?.error || `${serviceName} API error: ${status}`);
}

function getStreamingFetch() {
  const webFetch = typeof window !== 'undefined' ? window.CapacitorWebFetch : undefined;
  const buffered = Boolean(Capacitor.isNativePlatform() && !webFetch);
  if (buffered && !bufferedTransport) {
    // Never degrade silently: device evidence reads this flag, and the warn
    // makes a Capacitor upgrade that renames the internal visible in logs.
    console.warn('[streamChat] CapacitorWebFetch missing — buffered transport, no incremental streaming.');
    if (typeof window !== 'undefined') window.__CHAT_BUFFERED_TRANSPORT__ = true;
  }
  bufferedTransport = buffered;
  return webFetch || fetch;
}

export async function streamWithAuth({ url, body, onDelta, onDone, onError, maxRetries = 2 }) {
  const token = await getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const streamingFetch = getStreamingFetch();
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }

    let sawByte = false;
    let sawUsage = false;

    try {
      const response = await streamingFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await parseErrorBody(response);
        const typed = parseTypedError(data, response.status);
        if (typed) throw typed;
        const err = errorFromStatus(data, response.status);
        if ([429, 529, 503].includes(response.status) && attempt < maxRetries) {
          lastError = err;
          continue;
        }
        throw err;
      }

      const reader = response.body?.getReader?.();
      if (!reader) throw makeError('stream_unavailable', 'Streaming is not available in this browser.');

      try {
      const decoder = new TextDecoder();
      let pending = '';

      while (true) {
        const { value, done } = await reader.read();
        if (value?.length) sawByte = true;

        if (done) {
          pending += decoder.decode();
          break;
        }

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n');
        pending = lines.pop() || '';

        for (const line of lines) {
          if (!line) continue;
          let frame;
          try {
            frame = JSON.parse(line);
          } catch {
            throw makeError('malformed_stream', 'The AI stream returned malformed data.');
          }

          if (frame.type === 'delta') {
            onDelta?.(frame.text || '');
          } else if (frame.type === 'usage') {
            sawUsage = true;
            onDone?.({ usage: frame.usage, stopReason: frame.stop_reason });
            return;
          } else if (frame.type === 'error') {
            throw makeError(frame.code || 'stream_error', frame.message || 'The AI stream stopped unexpectedly.');
          }
        }
      }

      const tail = pending.trim();
      if (tail) {
        let frame;
        try {
          frame = JSON.parse(tail);
        } catch {
          throw makeError('malformed_stream', 'The AI stream returned malformed data.');
        }
        if (frame.type === 'usage') {
          sawUsage = true;
          onDone?.({ usage: frame.usage, stopReason: frame.stop_reason });
          return;
        }
        if (frame.type === 'delta') {
          onDelta?.(frame.text || '');
        } else if (frame.type === 'error') {
          throw makeError(frame.code || 'stream_error', frame.message || 'The AI stream stopped unexpectedly.');
        }
      }

      if (!sawUsage) {
        if (!sawByte && attempt < maxRetries) {
          lastError = makeError('stream_incomplete', 'The AI stream ended before it returned usage.');
          continue;
        }
        throw makeError('stream_incomplete', 'The AI stream ended before it returned usage.');
      }
      } finally {
        // cancel() releases the lock AND closes the connection, so an early
        // return or thrown error signals the server to abort upstream.
        reader.cancel().catch(() => {});
      }
    } catch (err) {
      if (!sawByte && attempt < maxRetries) {
        lastError = err;
        continue;
      }
      onError?.(err);
      return;
    }
  }

  onError?.(lastError || makeError('stream_failed', 'The AI stream failed. Please try again.'));
}
