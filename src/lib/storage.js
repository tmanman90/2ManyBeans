// Firebase Storage helpers for bean product photos
// NOTE: Product shot UPLOADS are now handled server-side (api/product-shot.js)
// to bypass CapacitorHttp XHR interception on iOS. Only delete remains client-side.
import { ref, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

// Delete a bean's photo from Storage (silent on not-found)
export async function deleteBeanPhoto(uid, beanId) {
  try {
    const jpgRef = ref(storage, `users/${uid}/bean-photos/${beanId}.jpg`);
    const pngRef = ref(storage, `users/${uid}/bean-photos/${beanId}.png`);
    await Promise.allSettled([deleteObject(jpgRef), deleteObject(pngRef)]);
  } catch (err) {
    if (err.code !== 'storage/object-not-found') {
      console.error('Failed to delete bean photo:', err);
    }
  }
}
