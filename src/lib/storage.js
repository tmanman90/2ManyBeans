// Firebase Storage helpers for bean product photos.
//
// NOTE: Product shot UPLOADS are handled server-side (api/product-shot.js)
// to bypass CapacitorHttp XHR interception on iOS. Only delete remains
// client-side, and it's called from the deleteBean cascade -- not on the
// critical app-boot path. Both firebase/storage and the storage singleton
// are lazy-loaded here so the Storage SDK stays out of the main bundle.
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
