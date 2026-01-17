import path from "path";

/**
 * Maximum allowed file size for image uploads (5MB).
 */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Supported MIME types for image uploads.
 */
export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Supported file extensions for image uploads.
 */
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * Supported image formats derived from file signatures.
 */
export type ImageFormat = 'jpg' | 'png' | 'webp';

/**
 * Detects the image format based on file magic bytes.
 * 
 * Supports:
 * - JPEG (FF D8 FF)
 * - PNG (89 50 4E 47)
 * - WebP (RIFF....WEBP)
 * 
 * @param buffer The file buffer to inspect.
 * @returns The detected format ('jpg', 'png', 'webp') or null if unknown.
 */
export function detectImageFormat(buffer: Buffer): ImageFormat | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // Check for JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpg';
  }

  // Check for PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }

  // Check for WebP: RIFF (0-3) ... WEBP (8-11)
  // 'R' = 0x52, 'I' = 0x49, 'F' = 0x46
  // 'W' = 0x57, 'E' = 0x45, 'B' = 0x42, 'P' = 0x50
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'webp';
  }

  return null;
}

/**
 * Checks if the file buffer corresponds to a valid supported image format.
 * 
 * @param buffer The file buffer to check.
 * @returns True if the file is a valid supported image, false otherwise.
 */
export function isValidImageFile(buffer: Buffer): boolean {
  return detectImageFormat(buffer) !== null;
}

/**
 * Determines the normalized file extension based on the filename.
 * Defaults to 'jpg' if unknown (legacy behavior preserved but improved for supported types).
 * 
 * @param fileName The name of the file.
 * @returns The extension string (e.g., 'png', 'webp', 'jpg').
 */
export function getExtension(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".png")) return "png";
  if (lowerName.endsWith(".webp")) return "webp";
  if (lowerName.endsWith(".jpeg") || lowerName.endsWith(".jpg")) return "jpg";
  return "jpg"; // Default fallback
}

/**
 * Validates if the uploaded file object passes basic MIME and extension checks.
 * Note: This relies on user-provided metadata. Use `detectImageFormat` for secure content validation.
 * 
 * @param file The File object from the request.
 * @returns True if the MIME type and extension are allowed.
 */
export function isAllowedFile(file: File): boolean {
  if (ALLOWED_MIME_TYPES.has(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}
