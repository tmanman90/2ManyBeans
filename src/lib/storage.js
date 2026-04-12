// Firebase Storage helpers for bean product photos.
//
// NOTE: All UPLOADS are handled server-side (api/product-shot.js) to bypass
// CapacitorHttp XHR interception on iOS. Only delete remains client-side,
// and it's called from the deleteBean cascade -- not on the critical
// app-boot path. Both firebase/storage and the storage singleton are
// lazy-loaded here so the Storage SDK stays out of the main bundle.

import { Capacitor } from '@capacitor/core';
import { getAuth } from 'firebase/auth';

// Upload the user's original bean photo (no AI product shot).
// Server-side: normalizes EXIF, compresses to progressive mozjpeg, uploads to Storage.
export async function uploadOriginalPhoto(beanId, photo, { skipFirestoreWrite = false } = {}) {
  const baseUrl = Capacitor.isNativePlatform()
    ? 'https://2manybeans.vercel.app'
    : '';
  const token = await getAuth().currentUser?.getIdToken();
  const res = await fetch(`${baseUrl}/api/product-shot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action: 'upload-original',
      beanId,
      photo: { base64: photo.base64, mimeType: photo.mediaType || 'image/jpeg' },
      skipFirestoreWrite,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Photo upload failed');
  }
  return res.json();
}

export async function deleteBeanPhoto(uid, beanId) {
  try {
    const [{ ref, deleteObject }, { getAppStorage }] = await Promise.all([
      import('firebase/storage'),
      import('../firebase'),
    ]);
    const storage = await getAppStorage();
    const jpgRef = ref(storage, `users/${uid}/bean-photos/${beanId}.jpg`);
    const pngRef = ref(storage, `users/${uid}/bean-photos/${beanId}.png`);
    await Promise.allSettled([deleteObject(jpgRef), deleteObject(pngRef)]);
  } catch (err) {
    if (err.code !== 'storage/object-not-found') {
      console.error('Failed to delete bean photo:', err);
    }
  }
}
