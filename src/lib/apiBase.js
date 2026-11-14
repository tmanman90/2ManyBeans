import { Capacitor } from '@capacitor/core';

export const API_BASE = Capacitor.isNativePlatform()
  ? 'https://2manybeans.vercel.app'
  : '';

const isDevVariant = typeof __APP_VARIANT__ !== 'undefined' && __APP_VARIANT__ === 'dev';
const configuredRuphusBase = String(import.meta.env?.VITE_RUPHUS_API_BASE || '').trim().replace(/\/$/, '');

// Native dev builds use the isolated preview backend for Agent v3 authority.
// Missing configuration fails closed instead of falling through to production.
export const RUPHUS_API_BASE = Capacitor.isNativePlatform() && isDevVariant
  ? configuredRuphusBase
  : API_BASE;

export function ruphusApiUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  if (!RUPHUS_API_BASE) return normalizedPath;

  let base;
  try {
    base = new URL(RUPHUS_API_BASE);
  } catch {
    // A malformed/missing preview URL must fail closed. Returning a relative
    // path lets the caller surface its normal request error without ever
    // falling back to the production host.
    return normalizedPath;
  }

  const url = new URL(normalizedPath, base.origin);
  // Vercel deployment-protection parameters are part of the preview base,
  // not the endpoint path. Append rather than set so duplicate parameters
  // survive intact and cannot be silently dropped.
  for (const [key, value] of base.searchParams) {
    url.searchParams.append(key, value);
  }
  return url.toString();
}
