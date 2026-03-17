export async function loadTestImage(imagePath: string): Promise<string> {
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
