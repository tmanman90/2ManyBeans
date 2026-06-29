// assetUrl — keep native OTA bundles tiny by serving heavy, unchanging media (Ruphus
// mascot videos, 72MB+) from the web CDN instead of bundling them in every update. On
// native, paths under the CDN prefixes are rewritten to the absolute web URL (the files
// live on prod Vercel — verified 200). On web, paths stay relative (served by the host).
//
// Only assets confirmed present on the CDN belong here. The build's OTA step strips these
// folders from the uploaded bundle (see scripts/build-ota-slim.mjs).
import { Capacitor } from '@capacitor/core';

const CDN_BASE = 'https://2manybeans.vercel.app';
const CDN_PREFIXES = ['/images/ruphus-animations/'];

export function assetUrl(path) {
  if (!path || typeof path !== 'string' || !Capacitor.isNativePlatform()) return path;
  return CDN_PREFIXES.some(p => path.startsWith(p)) ? CDN_BASE + path : path;
}
