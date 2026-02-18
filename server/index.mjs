import "dotenv/config";
import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const app = express();
const port = Number(process.env.PORT || 8787);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set. /api/bg-blue will fail until configured.");
}
const ai = new GoogleGenAI({ apiKey });

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/api/bg-blue", upload.single("image"), async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "image file is required." });
    }

    const mimeType = req.file.mimetype || "image/png";
    const base64Image = req.file.buffer.toString("base64");

    const prompt = [
      {
        text:
          "この画像の背景を切り抜き、青色(#0000FF)に変更してください。グラデーションなどを用いないブルーバック画像を生成してください。",
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
      return res.status(502).json({
        error: "Gemini did not return image data.",
        detail: textPart?.text || null,
      });
    }

    const outMimeType = imagePart.inlineData.mimeType || "image/png";
    const outBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    res.setHeader("Content-Type", outMimeType);
    res.status(200).send(outBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Gemini background edit failed.", detail: message });
  }
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
