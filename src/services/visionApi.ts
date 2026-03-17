import type { GamePlugin } from '../types';
import { compressImage } from './imageCompression';

export interface VisionResponse {
  words: string[][];
}

export async function analyzeCards(base64Image: string, plugin: GamePlugin): Promise<string[][]> {
  console.log('analyzeCards called, original size:', Math.ceil(base64Image.length / 1024 / 1024), 'MB (base64 chars)');
  const compressedImage = await compressImage(base64Image, 4.5);
  console.log('After compression, size:', Math.ceil(compressedImage.length / 1024 / 1024), 'MB (base64 chars)');
  
  const mediaType = compressedImage.startsWith("data:image/png") ? "image/png" : "image/jpeg";
  const cleanBase64 = compressedImage.replace(/^data:image\/\w+;base64,/, "");
  
  console.log('cleanBase64 size:', Math.ceil(cleanBase64.length / 1024 / 1024), 'MB (base64 chars)');
  
  const model = import.meta.env.VITE_VISION_MODEL || "claude-sonnet-4-20250514";
  // Use current host for mobile access (not localhost)
  const apiHost = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;
  const apiUrl = `http://${apiHost}:3001/api/anthropic/v1/messages`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: cleanBase64 },
            },
            { type: "text", text: plugin.visionPrompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.map((b: { text?: string }) => b.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  
  let parsed: VisionResponse;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    console.error("Failed to parse vision response:", text);
    throw new Error("Invalid response format from vision API. Expected JSON with 'words' array.");
  }
  
  if (!parsed.words || !Array.isArray(parsed.words)) {
    throw new Error("Invalid response format: missing 'words' array");
  }
  
  return parsed.words;
}
