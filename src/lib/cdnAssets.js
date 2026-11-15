// Heavy, unchanging media (Ruphus mascot videos and stills, ~60 MB) that native
// builds load from the production web host instead of bundling. Plain data with
// no imports so vite.config.js can read it too: assetUrl.js rewrites these paths
// on native, and the native build drops these folders from dist so they never
// ride along in an App Store build or a Capgo OTA bundle.
//
// Only folders whose files are confirmed live on the CDN belong here.
export const CDN_BASE = 'https://2manybeans.vercel.app';
export const CDN_PREFIXES = ['/images/ruphus-animations/'];
