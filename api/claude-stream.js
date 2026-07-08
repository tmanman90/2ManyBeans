// Vercel serverless streaming proxy for Claude API
// Emits NDJSON frames so client code can preserve Firebase bearer auth.
import Anthropic from '@anthropic-ai/sdk';
import { withCorsAuthPro } from './_lib/cors-auth.js';
import { logApiUsage } from './_lib/costLogger.js';
import {
  ALLOWED_MODELS,
  FALLBACK_MODEL,
  RATE_LIMIT,
  buildClaudeParams,
} from './_lib/claudeShared.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
});

function mergeUsage(current, next) {
  if (!next) return current;
  return { ...(current || {}), ...next };
}

function friendlyStreamError(error) {
  const code = error?.status || error?.type || error?.code || 'stream_error';
  const message = error?.error?.error?.message
    || error?.error?.message
    || error?.message
    || 'The AI stream stopped unexpectedly. Please try again.';
  return { code, message };
}

function writeNdjson(res, frame) {
  res.write(`${JSON.stringify(frame)}\n`);
}

async function runStream({ params, req, res, decodedToken }) {
  let stream = null;
  let headersSent = false;
  let usage = null;
  let stopReason = null;
  let usageLogged = false;

  const logOnce = () => {
    if (usageLogged) return;
    usageLogged = true;
    logApiUsage({
      uid: decodedToken?.uid,
      provider: 'anthropic',
      model: params.model,
      feature: 'chat',
      endpoint: '/api/claude-stream',
      usage,
    });
  };

  const abortStream = () => {
    if (!stream || stream.aborted || stream.ended) return;
    if (typeof stream.abort === 'function') stream.abort();
    else stream.controller?.abort?.();
  };

  req.on('close', () => {
    abortStream();
    logOnce();
  });

  stream = client.messages.stream(params);

  for await (const event of stream) {
    if (!headersSent) {
      headersSent = true;
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      });
    }

    if (event.type === 'message_start') {
      usage = mergeUsage(usage, event.message?.usage);
      continue;
    }

    if (event.type === 'message_delta') {
      usage = mergeUsage(usage, event.usage);
      stopReason = event.delta?.stop_reason || stopReason;
      continue;
    }

    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      writeNdjson(res, { type: 'delta', text: event.delta.text });
      continue;
    }

    if (event.type === 'message_stop') {
      logOnce();
      writeNdjson(res, { type: 'usage', usage, stop_reason: stopReason });
      res.end();
      return { wrote: true };
    }

    if (event.type === 'error') {
      const err = friendlyStreamError(event.error || event);
      writeNdjson(res, { type: 'error', code: err.code, message: err.message });
      logOnce();
      res.end();
      return { wrote: true };
    }
  }

  if (headersSent && !res.writableEnded) {
    logOnce();
    writeNdjson(res, { type: 'usage', usage, stop_reason: stopReason });
    res.end();
    return { wrote: true };
  }

  return { wrote: false };
}

export default withCorsAuthPro(async (req, res, decodedToken) => {
  try {
    const { system, messages, maxTokens = 1000, model: requestedModel = 'claude-sonnet-5' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : 'claude-sonnet-5';
    let params = buildClaudeParams({ model, maxTokens, system, messages });

    try {
      await runStream({ params, req, res, decodedToken });
    } catch (primaryError) {
      if (res.headersSent) {
        const err = friendlyStreamError(primaryError);
        writeNdjson(res, { type: 'error', code: err.code, message: err.message });
        res.end();
        return;
      }

      if ([429, 529].includes(primaryError.status) && model !== FALLBACK_MODEL) {
        console.warn(`Primary stream model ${model} unavailable (${primaryError.status}), falling back to ${FALLBACK_MODEL}`);
        params = buildClaudeParams({ model: FALLBACK_MODEL, maxTokens, system, messages });
        await runStream({ params, req, res, decodedToken });
        return;
      }

      throw primaryError;
    }
  } catch (error) {
    console.error('Claude stream API error:', error);
    const status = error.status || 500;
    const detail = error.error?.error?.message || error.message || 'Unknown error';
    return res.status(status).json({ error: detail });
  }
}, { rateLimit: RATE_LIMIT });
