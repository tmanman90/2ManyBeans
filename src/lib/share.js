import { Capacitor } from '@capacitor/core';

/**
 * Share an image (data URL) with optional text via native share sheet or Web Share API.
 * Falls back to copying text to clipboard on unsupported browsers.
 */
export async function shareImage(dataUrl, text) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    // Single filename prevents cache directory bloat
    const saved = await Filesystem.writeFile({
      path: 'share-card.png',
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({ text, files: [saved.uri] });
  } else if (navigator.share) {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'share-card.png', { type: 'image/png' });
    await navigator.share({ text, files: [file] });
  } else {
    await navigator.clipboard.writeText(text);
  }
}
