export const MIN_PHOTO_SCALE = 1;
export const MAX_PHOTO_SCALE = 4;

export function clampPhotoScale(scale: number) {
  if (!Number.isFinite(scale)) return MIN_PHOTO_SCALE;
  return Math.max(MIN_PHOTO_SCALE, Math.min(MAX_PHOTO_SCALE, scale));
}

export function pinchScale(startScale: number, startDistance: number, distance: number) {
  if (startDistance <= 0 || distance <= 0) return clampPhotoScale(startScale);
  return clampPhotoScale(startScale * distance / startDistance);
}

type PhotoTouch = { pageX: number; pageY: number; locationX?: number; locationY?: number };

function touchCoordinates(touch: PhotoTouch) {
  return { x: touch.locationX ?? touch.pageX, y: touch.locationY ?? touch.pageY };
}

export function touchDistance(touches: readonly PhotoTouch[]) {
  const [a, b] = touches;
  if (!a || !b) return 0;
  const first = touchCoordinates(a);
  const second = touchCoordinates(b);
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function touchCenter(touches: readonly PhotoTouch[]) {
  const [a, b] = touches;
  if (!a || !b) return null;
  const first = touchCoordinates(a);
  const second = touchCoordinates(b);
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

export function anchoredPhotoOffset(startOffset: number, startScale: number, nextScale: number, startFocal: number, nextFocal: number, viewportCenter: number) {
  if (startScale <= 0) return startOffset;
  const ratio = nextScale / startScale;
  return startOffset + nextFocal - startFocal + (1 - ratio) * (startFocal - viewportCenter - startOffset);
}

export function containedPhotoSize(imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number) {
  if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return { width: 0, height: 0 };
  const ratio = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
  return { width: imageWidth * ratio, height: imageHeight * ratio };
}

export function clampPhotoOffset(offset: number, scale: number, viewportSize: number, containedImageSize = viewportSize) {
  if (scale <= MIN_PHOTO_SCALE || viewportSize <= 0) return 0;
  const limit = Math.max(0, (containedImageSize * scale - viewportSize) / 2);
  return Math.max(-limit, Math.min(limit, offset));
}
