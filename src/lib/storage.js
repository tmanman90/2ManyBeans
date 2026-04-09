// Firebase Storage helpers for bean product photos
// IMPORTANT: CapacitorHttp patches XMLHttpRequest on iOS, which breaks Blob uploads.
// We use uploadString (base64) instead of uploadBytes (Blob) to bypass this entirely.
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

function beanPhotoRef(uid, beanId, mimeType = 'image/jpeg') {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  return ref(storage, `users/${uid}/bean-photos/${beanId}.${ext}`);
}

// Upload a product shot and return the download URL
// Uses uploadString with base64 format — no Blob needed, works with CapacitorHttp
export async function uploadBeanPhoto(uid, beanId, base64, mimeType = 'image/jpeg') {
  const photoRef = beanPhotoRef(uid, beanId, mimeType);
  // 30s timeout so the UI never hangs indefinitely
  const upload = uploadString(photoRef, base64, 'base64', { contentType: mimeType });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timed out after 30s')), 30000));
  await Promise.race([upload, timeout]);
  return getDownloadURL(photoRef);
}

// Delete a bean's photo from Storage (silent on not-found)
export async function deleteBeanPhoto(uid, beanId) {
  try {
    // Try both extensions since we don't know which was used
    const jpgRef = ref(storage, `users/${uid}/bean-photos/${beanId}.jpg`);
    const pngRef = ref(storage, `users/${uid}/bean-photos/${beanId}.png`);
    await Promise.allSettled([deleteObject(jpgRef), deleteObject(pngRef)]);
  } catch (err) {
    if (err.code !== 'storage/object-not-found') {
      console.error('Failed to delete bean photo:', err);
    }
  }
}
