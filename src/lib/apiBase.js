import { Capacitor } from '@capacitor/core';

export const API_BASE = Capacitor.isNativePlatform()
  ? 'https://2manybeans.vercel.app'
  : '';

const isDevVariant = typeof __APP_VARIANT__ !== 'undefined' && __APP_VARIANT__ === 'dev';
const configuredRuphusBase = String(import.meta.env?.VITE_RUPHUS_API_BASE || '').replace(/\/$/, '');

// Native dev builds use the isolated preview backend for Agent v3 authority.
// Missing configuration fails closed instead of falling through to production.
export const RUPHUS_API_BASE = Capacitor.isNativePlatform() && isDevVariant
  ? configuredRuphusBase
  : API_BASE;
