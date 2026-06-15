import { compressImage } from './claude';

const PHOTO_PERMISSION_OK = new Set(['granted', 'limited']);

export const hasPhotoLibraryAccess = (permissionState) => PHOTO_PERMISSION_OK.has(permissionState);

export const isPhotoPickerCancel = (err) => /cancel/i.test(err?.message || '');

export async function ensurePhotoLibraryAccess(Camera) {
  const perms = await Camera.checkPermissions();
  if (hasPhotoLibraryAccess(perms.photos)) return true;

  const requested = await Camera.requestPermissions({ permissions: ['photos'] });
  return hasPhotoLibraryAccess(requested.photos);
}

const mimeTypeForGalleryPhoto = (photo) => {
  const format = (photo?.format || '').toLowerCase();
  if (format === 'png') return 'image/png';
  if (format === 'gif') return 'image/gif';
  if (format === 'webp') return 'image/webp';
  return 'image/jpeg';
};

async function galleryPhotoToBlob(photo) {
  if (photo?.webPath) {
    try {
      const response = await fetch(photo.webPath);
      if (!response.ok) {
        throw new Error(`Failed to load selected photo (${response.status})`);
      }
      return response.blob();
    } catch (err) {
      if (!photo.path) throw err;
    }
  }

  if (photo?.path) {
    const { Filesystem } = await import('@capacitor/filesystem');
    const result = await Filesystem.readFile({ path: photo.path });
    const response = await fetch(`data:${mimeTypeForGalleryPhoto(photo)};base64,${result.data}`);
    return response.blob();
  }

  throw new Error('Selected photo is missing a readable path');
}

export async function galleryPhotosToScanPhotos(galleryPhotos, { limit = 3 } = {}) {
  const selected = Array.from(galleryPhotos || []).slice(0, limit);
  const converted = await Promise.all(selected.map(async (photo, idx) => {
    const blob = await galleryPhotoToBlob(photo);
    const type = blob.type || mimeTypeForGalleryPhoto(photo);
    const fileLike = typeof File === 'function'
      ? new File([blob], `selected-photo-${idx + 1}.jpg`, { type })
      : new Blob([blob], { type });
    return compressImage(fileLike);
  }));
  return converted;
}
