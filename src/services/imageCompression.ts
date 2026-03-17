export async function compressImage(base64DataUrl: string, maxSizeMB = 4.5): Promise<string> {
  // Anthropic counts base64 STRING LENGTH, not decoded bytes
  const currentSizeBytes = base64DataUrl.length;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  console.log(`compressImage: current=${(currentSizeBytes/1024/1024).toFixed(2)}MB (base64 chars), max=${(maxSizeBytes/1024/1024).toFixed(2)}MB, needsCompression=${currentSizeBytes > maxSizeBytes}`);
  
  if (currentSizeBytes <= maxSizeBytes) {
    console.log('Image within limits, no compression needed');
    return base64DataUrl;
  }
  
  console.log(`Compressing image: ${(currentSizeBytes / 1024 / 1024).toFixed(2)}MB → target ${maxSizeMB}MB`);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // File size roughly scales with area, but JPEG has overhead
      // Use a more conservative scale factor to ensure we hit target
      const scaleFactor = Math.sqrt((maxSizeBytes * 0.7) / currentSizeBytes);
      let width = Math.max(800, Math.floor(img.width * scaleFactor));
      let height = Math.max(600, Math.floor(img.height * scaleFactor));
      let quality = 0.85;
      let attempts = 0;
      const maxAttempts = 15;
      
      const tryCompress = () => {
        attempts++;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        const compressed = canvas.toDataURL('image/jpeg', quality);
        const compressedSize = compressed.length;
        
        console.log(`  Attempt ${attempts}: ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${width}x${height}, q=${quality.toFixed(2)})`);
        
        if (compressedSize <= maxSizeBytes) {
          console.log(`✓ Compressed to target: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
          resolve(compressed);
        } else if (attempts >= maxAttempts) {
          console.warn(`Max attempts reached. Forcing aggressive compression.`);
          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = 800;
          finalCanvas.height = Math.floor(800 * (img.height / img.width));
          const finalCtx = finalCanvas.getContext('2d');
          if (finalCtx) {
            finalCtx.drawImage(img, 0, 0, finalCanvas.width, finalCanvas.height);
          }
          const finalCompressed = finalCanvas.toDataURL('image/jpeg', 0.7);
          resolve(finalCompressed);
        } else if (quality > 0.5) {
          quality -= 0.15;
          tryCompress();
        } else {
          width = Math.max(800, Math.floor(width * 0.85));
          height = Math.max(600, Math.floor(height * 0.85));
          quality = 0.75;
          tryCompress();
        }
      };
      
      tryCompress();
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = base64DataUrl;
  });
}
