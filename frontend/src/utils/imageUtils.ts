/**
 * Compress and convert image to base64
 * @param file - Image file
 * @param maxWidth - Maximum width (default: 400px for logos)
 * @param maxHeight - Maximum height (default: 400px for logos)
 * @param quality - Quality 0-1 (default: 0.8) - applies to JPEG/WebP only
 * @returns Promise<string> - Base64 encoded image
 */
export async function compressImageToBase64(
  file: File,
  maxWidth: number = 400,
  maxHeight: number = 400,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        // Create canvas for compression
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        // Determine output format based on original file type
        // PNG preserves transparency, JPEG is more compressed
        let mimeType = 'image/jpeg';
        let outputQuality = quality;

        if (file.type === 'image/png') {
          // Keep PNG format to preserve transparency
          mimeType = 'image/png';
          outputQuality = 1; // PNG quality is ignored, but set to 1 for consistency
        } else if (file.type === 'image/webp') {
          mimeType = 'image/webp';
        }

        // Convert to base64
        const base64 = canvas.toDataURL(mimeType, outputQuality);
        resolve(base64);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Validate image file
 * @param file - File to validate
 * @param maxSizeMB - Maximum file size in MB (default: 5MB)
 * @returns Error message if invalid, null if valid
 */
export function validateImageFile(file: File, maxSizeMB: number = 5): string | null {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return 'El archivo debe ser una imagen';
  }

  // Check file size
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return `La imagen no debe superar ${maxSizeMB}MB`;
  }

  // Check valid image formats
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return 'Formato de imagen no soportado. Use JPG, PNG, GIF o WebP';
  }

  return null;
}

/**
 * Get base64 string size in KB
 * @param base64 - Base64 encoded string
 * @returns Size in KB
 */
export function getBase64Size(base64: string): number {
  // Remove data:image prefix if present
  const base64Data = base64.split(',')[1] || base64;

  // Calculate size: base64 encoding adds ~33% overhead
  // Size in bytes = (base64 length * 3) / 4
  const sizeInBytes = (base64Data.length * 3) / 4;

  // Convert to KB
  return Math.round(sizeInBytes / 1024);
}
