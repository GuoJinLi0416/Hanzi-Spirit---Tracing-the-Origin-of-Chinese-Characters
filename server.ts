import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import { Storage } from "@google-cloud/storage";
import sharp from "sharp";
import "dotenv/config";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' })); // Increased limit for audio

  const storage = new Storage();
  const bucketName = "hanzi_spirit_v1";

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper function to generate and save image
  async function generateAndSaveImage(char: string, analysis: any, retries = 5): Promise<boolean> {
    console.log(`Generating image for char: ${char}`);
    const apiKey = process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("No Gemini API key found in environment.");
      return false;
    }
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `A realistic, high-quality photograph representing the concept of the Chinese character "${char}". The concept is: ${analysis.explanation.en_modern[0].def}. Do not include the character itself in the image. Artistic, suitable for daily life context.`;
    
    for (let i = 0; i < retries; i++) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image-preview',
          contents: {
            parts: [{ text: prompt }],
          },
          config: {
            imageConfig: { aspectRatio: "1:1" },
          },
        });

        if (!response.candidates || response.candidates.length === 0) {
          throw new Error("No candidates in response");
        }

        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64EncodeString: string = part.inlineData.data;
            const buffer = Buffer.from(base64EncodeString, 'base64');
            
            // 使用 sharp 压缩图片
            const compressedBuffer = await sharp(buffer)
              .resize(800, 800, { fit: 'inside' }) // 限制最大尺寸
              .jpeg({ quality: 60 }) // 调整质量以控制大小
              .toBuffer();

            const file = storage.bucket(bucketName).file(`images/image_${char}.png`);
            await file.save(compressedBuffer, { metadata: { contentType: 'image/jpeg' } });
            console.log(`Image saved for char: ${char}, size: ${compressedBuffer.length} bytes`);
            return true;
          }
        }
        throw new Error("No image data found in response parts");
      } catch (error: any) {
        const isQuotaError = error.status === 'RESOURCE_EXHAUSTED' || error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED");
        if (isQuotaError && i < retries - 1) {
          // Increase delay: 5s, 10s, 20s, 40s...
          const delay = Math.pow(2, i) * 5000 + Math.random() * 1000; 
          console.warn(`Quota exhausted for ${char}, retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
          await sleep(delay);
          continue;
        }
        console.error(`Error generating image for ${char} (Attempt ${i + 1}/${retries}):`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        if (i === retries - 1) return false;
      }
    }
    return false;
  }

  app.get("/api/test", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/generate-video/:char", async (req, res) => {
    const { char } = req.params;
    console.log(`Generating video for char: ${char}`);
    const apiKey = process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API Key not configured" });

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `A video showing the origin and evolution of the Chinese character "${char}". Start with the ancient script (oracle bone/bronze/seal) and evolve it into the modern form. Artistic, minimalist style.`;
      
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      // Poll for completion
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }

      const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoUri) throw new Error("Video generation failed");

      // Download and save to GCS
      const response = await fetch(videoUri, {
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey },
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = `videos/video_${char}.mp4`;
      const file = storage.bucket(bucketName).file(filename);
      await file.save(buffer, { metadata: { contentType: 'video/mp4' } });

      res.json({ videoUrl: `/api/videos/video_${char}.mp4` });
    } catch (error: any) {
      console.error("Error generating video:", error);
      res.status(500).json({ error: "Failed to generate video" });
    }
  });

  app.get("/api/video-exists/:char", async (req, res) => {
    const { char } = req.params;
    console.log(`Checking video existence for char: ${char}`);
    const extensions = ['mp4', 'mov'];
    
    for (const ext of extensions) {
      const videoFilename = `videos/video_${char}.${ext}`;
      const videoFile = storage.bucket(bucketName).file(videoFilename);
      const [exists] = await videoFile.exists();
      if (exists) {
        console.log(`Video found: ${videoFilename}`);
        return res.json({ 
          exists: true, 
          videoUrl: `/api/videos/video_${char}.${ext}` 
        });
      }
    }
    
    console.log(`No video found for char: ${char}`);
    res.json({ exists: false });
  });

  app.get("/api/videos/:filename", async (req, res) => {
    const { filename } = req.params;
    console.log(`Attempting to fetch video: ${filename} from bucket: ${bucketName}`);
    try {
      const filePath = `videos/${filename}`;
      const file = storage.bucket(bucketName).file(filePath);
      const [exists] = await file.exists();
      
      if (!exists) {
        return res.status(404).json({ error: "Video not found", path: filePath });
      }

      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType || 'video/mp4';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      
      // Stream the video
      file.createReadStream().pipe(res);
    } catch (error: any) {
      console.error("Error fetching video from GCS:", error);
      res.status(500).json({ error: "Failed to fetch video", details: error.message });
    }
  });

  app.get("/api/image-exists/:char", async (req, res) => {
    const { char } = req.params;
    console.log(`Checking image existence for char: ${char}`);
    const extensions = ['png', 'jpg'];
    
    for (const ext of extensions) {
      const filename = `images/image_${char}.${ext}`;
      const file = storage.bucket(bucketName).file(filename);
      const [exists] = await file.exists();
      if (exists) {
        console.log(`Image found: ${filename}`);
        return res.json({ exists: true, imageUrl: `/api/images/image_${char}.${ext}` });
      }
    }
    
    console.log(`No image found for char: ${char}`);
    res.json({ exists: false });
  });

  // API Routes
  app.get("/api/images/:filename", async (req, res) => {
    const { filename } = req.params;
    console.log(`Attempting to fetch image: ${filename} from bucket: ${bucketName}`);
    try {
      // 根据调试信息，实际路径是 images/image_山.png
      const filePath = `images/${filename}`; 
      console.log(`Full file path in GCS: ${filePath}`);
      const file = storage.bucket(bucketName).file(filePath);
      const [exists] = await file.exists();
      console.log(`File exists: ${exists}`);
      
      if (!exists) {
        return res.status(404).json({ error: "Image not found", path: filePath });
      }

      const [metadata] = await file.getMetadata();
      const [buffer] = await file.download();
      res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
      res.send(buffer);
    } catch (error: any) {
      console.error("Error fetching image from GCS:", error);
      res.status(500).json({ error: "Failed to fetch image", details: error.message });
    }
  });

  app.post("/api/upload-audio", async (req, res) => {
    const { char, audioBase64 } = req.body;
    if (!char || !audioBase64) return res.status(400).json({ error: "Char and audio are required" });

    try {
      const buffer = Buffer.from(audioBase64, 'base64');
      const filename = `audio/audio_${char}.wav`;
      const file = storage.bucket(bucketName).file(filename);

      await file.save(buffer, {
        metadata: { contentType: 'audio/wav' },
      });

      res.json({ success: true, url: `https://storage.googleapis.com/${bucketName}/${filename}` });
    } catch (error: any) {
      console.error("Error uploading to GCS:", error);
      res.status(500).json({ error: "Failed to upload audio" });
    }
  });

  app.post("/api/tts", async (req, res) => {
    const { char } = req.body;
    console.log("Processing TTS for char:", char);
    if (!char) return res.status(400).json({ error: "Char is required" });

    const currentApiKey = process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY;
    console.log("Using API Key (first 5 chars):", currentApiKey ? currentApiKey.substring(0, 5) : "undefined");
    if (!currentApiKey) return res.status(500).json({ error: "API Key not configured" });

    try {
      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Read the character: ${char}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Puck' },
            },
          },
        },
      });

      console.log("TTS Response:", JSON.stringify(response, null, 2));

      // Extract audio data from the response
      let base64Audio = null;
      
      // The Gemini SDK response structure might have audio in different parts
      if (response.candidates && response.candidates.length > 0) {
        for (const candidate of response.candidates) {
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.inlineData && part.inlineData.data) {
                base64Audio = part.inlineData.data;
                break;
              }
            }
          }
          if (base64Audio) break;
        }
      }

      if (!base64Audio) {
        console.error("No audio data found in response parts.");
        throw new Error("No audio generated. Response: " + JSON.stringify(response));
      }
      
      res.json({ audioBase64: base64Audio });
    } catch (error: any) {
      console.error("Error in /api/tts:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    // Try to get GEMINI_API_KEY2 first, then fallback to GEMINI_API_KEY
    const currentApiKey = process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY;
    
    if (!currentApiKey || currentApiKey.trim() === "") {
      console.error("No Gemini API key found in environment.");
      return res.status(500).json({ 
        error: "未检测到 API Key。请确保在 Secrets 面板中配置了 GEMINI_API_KEY2 或 GEMINI_API_KEY。" 
      });
    }

    // Safe logging for debugging
    console.log(`API Key check: length=${currentApiKey.length}, startsWith=${currentApiKey.substring(0, 3)}...`);

    try {
      const ai = new GoogleGenAI({ apiKey: currentApiKey });

      const systemInstruction = `你是一位精通《说文解字》和《现代汉语词典》的汉字专家。
当用户输入一个字，你需要输出一个 JSON 对象，包含以下字段：
1. pinyin: 该汉字的拼音（必须全部小写）。
2. explanation: 
   - zh_origin: 该汉字的字源本意解释（参考说文解字）。
   - zh_modern: 一个数组，包含该汉字在现代汉语中的常用释义。每个对象包含：
     - pos: 词性（如：名、动、形）。
     - def: 释义。
     - example: 举例。
   - en_origin: 英文本意解释。
   - en_modern: An array of modern English definitions. Each object contains:
     - pos: Part of speech (e.g., n., v., adj.).
     - def: Definition.
     - example: Example usage.
3. scripts: 一个对象，包含该汉字的四种书体对应的名称（中文）：
   - oracle: 甲骨文名称。
   - bronze: 金文名称。
   - seal: 小篆名称。
   - clerical: 隶书名称。

JSON 格式示例：
{
  "pinyin": "shān",
  "explanation": {
    "zh_origin": "象形。甲骨文字形，象山峰并立之形。本义：地面上由土石构成的隆起部分。",
    "zh_modern": [
      { "pos": "名", "def": "地面上由土石构成的隆起部分。", "example": "高山、山脉" }
    ],
    "en_origin": "Pictogram. The script resembles standing peaks.",
    "en_modern": [
      { "pos": "n.", "def": "A natural elevation of the earth's surface.", "example": "high mountain" }
    ]
  },
  "scripts": {
    "oracle": "Oracle bone script of the character, black on white background, minimalist",
    "bronze": "Bronze script of the character, black on white background, minimalist",
    "seal": "Small seal script of the character, black on white background, minimalist",
    "clerical": "Clerical script of the character, black on white background, minimalist"
  }
}

请只返回 JSON 对象，不要包含任何 Markdown 格式。`;

      let result;
      let retries = 3;
      for (let i = 0; i < retries; i++) {
        try {
          result = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: [{ role: "user", parts: [{ text: `解析汉字：${message}` }] }],
            config: {
              systemInstruction,
              responseMimeType: "application/json",
            },
          });
          if (result.text) break;
          throw new Error("Empty response");
        } catch (error: any) {
          const isQuotaError = error.status === 'RESOURCE_EXHAUSTED' || error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED");
          if (isQuotaError && i < retries - 1) {
            const delay = Math.pow(2, i) * 5000 + Math.random() * 1000;
            console.warn(`Quota exhausted for text generation, retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
            await sleep(delay);
            continue;
          }
          throw error;
        }
      }

      const text = result?.text;
      if (!text) {
        throw new Error("Failed to generate content after retries");
      }
      
      try {
        const parsed = JSON.parse(text);
        
        // Check if image exists, if not, generate it
        const char = message;
        const filename = `images/image_${char}.png`;
        const file = storage.bucket(bucketName).file(filename);
        const [exists] = await file.exists();
        
        if (!exists) {
          const imageGenerated = await generateAndSaveImage(char, parsed);
          if (!imageGenerated) {
            console.warn(`Image generation failed for ${char}, but returning text analysis.`);
          }
        }
        
        res.json(parsed);
      } catch (parseError) {
        console.error("JSON Parse Error. Raw text:", text);
        // Try to fix common issues or just return error
        res.status(500).json({ error: "Invalid JSON response from AI", raw: text });
      }
    } catch (error: any) {
      console.error("Error in /api/chat:", error);
      
      // Check for Quota Exceeded (429)
      if (error.status === 429 || error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED")) {
        return res.status(429).json({ 
          error: "API 额度已耗尽 (Quota Exceeded)。请稍后再试或检查您的 API Key 配额。" 
        });
      }

      res.status(500).json({ error: error.message || "Failed to generate content" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
