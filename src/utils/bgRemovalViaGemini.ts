import { GoogleGenAI } from "@google/genai";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function getGeminiApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) {
    throw new Error("VITE_GEMINI_API_KEY is not set. Please configure it in .env.");
  }
  return key;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load processed image blob."));
    };
    image.src = url;
  });
}

export async function requestBlueBackgroundImage(file: File): Promise<Blob> {
  const apiKey = getGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const mimeType = file.type || "image/png";
  const base64Image = await blobToBase64(file);

  const prompt = [
    {
      text:
        "この画像の背景を切り抜き、青色(#0000FF)に変更してください。グラデーションなどを用いないブルーバック画像を生成してください。"
    },
    {
      inlineData: {
        mimeType,
        data: base64Image,
      },
    },
  ];

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: prompt,
  });

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part?.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const textPart = parts.find((part) => typeof part?.text === "string");
    throw new Error(`Gemini did not return image data.${textPart?.text ? ` detail: ${textPart.text}` : ""}`);
  }

  const outMimeType = imagePart.inlineData.mimeType || "image/png";
  const bytes = Uint8Array.from(atob(imagePart.inlineData.data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: outMimeType });
}

export async function convertBlueToTransparent(
  blueBgImageBlob: Blob,
  options?: {
    exactTolerance?: number;
    nearTolerance?: number;
  },
): Promise<Blob> {
  const image = await loadImageFromBlob(blueBgImageBlob);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context for blue-to-alpha conversion.");
  }

  ctx.drawImage(image, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;

  // Primary target is exact #0000FF. Keep a small near tolerance for compression artifacts.
  const exactTolerance = clamp(options?.exactTolerance ?? 0, 0, 255);
  const nearTolerance = clamp(options?.nearTolerance ?? 16, 0, 255);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const isExactBlue =
      Math.abs(r - 0) <= exactTolerance &&
      Math.abs(g - 0) <= exactTolerance &&
      Math.abs(b - 255) <= exactTolerance;

    const isNearBlue =
      Math.abs(r - 0) <= nearTolerance &&
      Math.abs(g - 0) <= nearTolerance &&
      Math.abs(b - 255) <= nearTolerance;

    const isBlueBackground = isExactBlue || isNearBlue;
    if (isBlueBackground) {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(img, 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create transparent PNG blob."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
