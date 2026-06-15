import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const helper = read('src/lib/photoPicker.js');
const quickRecipe = read('src/components/QuickRecipeFlow.jsx');
const scanSheet = read('src/components/ScanSheet.jsx');
const editBeanModal = read('src/components/EditBeanModal.jsx');

assert.match(helper, /galleryPhotosToScanPhotos/);
assert.match(helper, /isPhotoPickerCancel/);
assert.match(helper, /compressImage/);
assert.match(helper, /fetch\(photo\.webPath\)/);
assert.match(helper, /slice\(0, limit\)/);
assert.match(helper, /requestPermissions\(\{ permissions: \['photos'\] \}\)/);

assert.match(quickRecipe, /pickNativePhotos/);
assert.match(quickRecipe, /Camera\.pickImages/);
assert.match(quickRecipe, /isPhotoPickerCancel/);
assert.match(quickRecipe, /limit: 3/);
assert.match(quickRecipe, /handlePhotosReady\(converted\)/);
assert.match(quickRecipe, /source: CameraSource\.Camera/);
assert.doesNotMatch(quickRecipe, /requestPermissions\(\{ permissions: \['camera', 'photos'\] \}\)/);

assert.match(scanSheet, /pickNativePhotos/);
assert.match(scanSheet, /Camera\.pickImages/);
assert.match(scanSheet, /isPhotoPickerCancel/);
assert.match(scanSheet, /const remaining = 3 - photos\.length/);
assert.match(scanSheet, /limit: remaining/);
assert.match(scanSheet, /setPhotos\(prev => \[\.\.\.prev, \.\.\.converted\]\.slice\(0, 3\)\)/);
assert.match(scanSheet, /source: CameraSource\.Camera/);
assert.doesNotMatch(scanSheet, /requestPermissions\(\{ permissions: \['camera', 'photos'\] \}\)/);
assert.match(scanSheet, /multiple ref=\{fileRef\}/);

assert.match(editBeanModal, /pendingPhotoPreviewSrc/);
assert.match(editBeanModal, /previewUrl\.startsWith\('blob:'\)/);
assert.match(editBeanModal, /src=\{pendingPhotoPreviewSrc\}/);

console.log('multi-photo picker regression passed');
