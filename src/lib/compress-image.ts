/**
 * Client-side image compression: grayscale + resize + JPEG compress.
 * Uses the browser's built-in <canvas> — zero external dependencies.
 *
 * Non-image files (PDFs, etc.) are returned unchanged.
 */

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.8;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp']);

/**
 * Compress an image file: convert to grayscale, resize to max 2000px,
 * and export as JPEG at 0.8 quality. Returns the original file unchanged
 * if it's not a supported image type.
 */
export async function compressImage(file: File): Promise<File> {
  if (!IMAGE_TYPES.has(file.type)) return file;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Calculate target dimensions preserving aspect ratio
  let targetW = width;
  let targetH = height;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    targetW = Math.round(width * scale);
    targetH = Math.round(height * scale);
  }

  // Draw to canvas
  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  // Convert to grayscale
  const imageData = ctx.getImageData(0, 0, targetW, targetH);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);

  // Export as JPEG
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });

  // Preserve original filename but change extension to .jpg
  const name = file.name.replace(/\.[^.]+$/, '.jpg');
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
}

/**
 * Compress multiple files in parallel.
 */
export async function compressImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressImage));
}
