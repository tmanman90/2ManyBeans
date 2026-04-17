// Redemption code client helper. Thin wrapper over fetchWithRetry.
//
// retries: 0 because redemption is not idempotent — the server's
// transactional lock is the source of truth, a retry on a successful
// but slow response would just hit `already_redeemed` on a phantom
// second call. Friendly per-reason copy lives in the Settings redeem
// row, not here.

import { fetchWithRetry } from './fetchWithRetry.js';
import { API_BASE } from './apiBase.js';

const URL = `${API_BASE}/api/redeem-code`;

export class RedeemError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export async function redeemCode(code) {
  try {
    return await fetchWithRetry({
      url: URL,
      body: { code },
      serviceName: 'Redeem',
      retries: 0,
    });
  } catch (err) {
    if (err?.code) throw new RedeemError(err.code);
    throw err;
  }
}
