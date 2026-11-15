// assetUrl — on native, rewrite paths under the CDN prefixes (see cdnAssets.js)
// to the absolute web URL, because the native build does not bundle them. On
// web, paths stay relative (served by the host).
import { Capacitor } from '@capacitor/core';
import { CDN_BASE, CDN_PREFIXES } from './cdnAssets.js';

export function assetUrl(path) {
  if (!path || typeof path !== 'string' || !Capacitor.isNativePlatform()) return path;
  return CDN_PREFIXES.some(p => path.startsWith(p)) ? CDN_BASE + path : path;
}
