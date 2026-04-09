// Firebase Storage helpers for bean product photos
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

function beanPhotoRef(uid, beanId) {
  return ref(storage, `users/${uid}/bean-photos/${beanId}.jpg`);
}

// Convert base64 string to Blob using atob + Uint8Array
// NOTE: fetch('data:...') does NOT work in iOS WKWebView — use manual decode
function base64ToBlob(base64, mimeType = 'image/jpeg') {
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: mimeType });
  if (blob.size === 0) throw new Error('base64ToBlob produced empty blob');
  return blob;
}

// Upload a product shot and return the download URL
export async function uploadBeanPhoto(uid, beanId, base64, mimeType = 'image/jpeg') {
  const blob = await base64ToBlob(base64, mimeType);
  const photoRef = beanPhotoRef(uid, beanId);
  await uploadBytes(photoRef, blob, { contentType: mimeType });
  return getDownloadURL(photoRef);
}

// Delete a bean's photo from Storage (silent on not-found)
export async function deleteBeanPhoto(uid, beanId) {
  try {
    const photoRef = beanPhotoRef(uid, beanId);
    await deleteObject(photoRef);
  } catch (err) {
    // Ignore not-found errors (photo may not exist)
    if (err.code !== 'storage/object-not-found') {
      console.error('Failed to delete bean photo:', err);
    }
  }
}
