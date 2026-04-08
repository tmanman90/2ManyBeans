// Shared product shot generation chain
// Used by AddBeanForm (fire-and-forget after save) and EditBeanModal (fire-and-forget with spinner)
import { generateProductShot } from './gemini';
import { uploadBeanPhoto } from './storage';

// Generate a product shot and upload it, then persist the URL to the bean doc.
// Returns the photoUrl on success, null on failure.
export async function generateAndUploadProductShot(photo, uid, beanId, updateBean) {
  const result = await generateProductShot(photo);
  if (!result?.base64) return null;
  const photoUrl = await uploadBeanPhoto(uid, beanId, result.base64, result.mimeType);
  await updateBean(beanId, { photoUrl });
  return photoUrl;
}
