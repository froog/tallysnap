export async function loadTestImage(imagePath: string): Promise<string> {
  // For Node.js environment
  if (typeof window === 'undefined') {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const fullPath = imagePath.startsWith('/') 
      ? path.join(__dirname, '../../public', imagePath)
      : imagePath;
      
    const imageBuffer = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const base64 = imageBuffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }
  
  // For browser environment
  const cacheBuster = `?_=${Date.now()}`;
  const response = await fetch(imagePath + cacheBuster);
  if (!response.ok) {
    throw new Error(`Failed to load test image: ${response.status} ${response.statusText}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.startsWith('image/')) {
    throw new Error(`Expected image but got ${contentType}. Make sure image is in public/ directory.`);
  }
  
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
