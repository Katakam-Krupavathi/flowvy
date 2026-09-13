import { GoogleGenerativeAI } from "@google/generative-ai";

export interface CallGeminiOptions {
  systemPrompt?: string;
  userMessage: string;
  images?: string[];
  model?: string;
}

export interface CallGeminiResponse {
  text: string;
  model: string;
}

/**
 * Resolves a list of image URLs (base64 data URIs or remote HTTP/HTTPS URLs) into Gemini inlineData parts.
 * Remote URLs are fetched server-side with timeout and size guards.
 */
async function resolveImageParts(images: string[]): Promise<Array<{ inlineData: { data: string; mimeType: string } }>> {
  if (!images || images.length === 0) return [];

  const maxImages = Math.min(4, images.length);
  const selectedUrls = images.slice(0, maxImages);

  const tasks = selectedUrls.map(async (imageUrl) => {
    try {
      if (typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
        const match = imageUrl.match(/^data:(.*?);base64,(.*)$/);
        if (match) {
          const mimeType = match[1] || "image/jpeg";
          const data = match[2] || "";
          return { inlineData: { data, mimeType } };
        }
        return null;
      }

      if (typeof imageUrl === "string" && /^https?:\/\//.test(imageUrl)) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timer);

        if (!res.ok) return null;

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.toLowerCase().startsWith("image/")) return null;

        const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
        if (isFinite(contentLength) && contentLength > 10 * 1024 * 1024) {
          return null; // Reject files larger than 10MB
        }

        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const mimeType = contentType || "image/jpeg";
        return { inlineData: { data: base64, mimeType } };
      }

      return null;
    } catch {
      return null;
    }
  });

  const settled = await Promise.allSettled(tasks);
  const parts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) {
      parts.push(result.value);
    }
  }

  return parts;
}

/**
 * Unified single shared function for calling Google Gemini models.
 * Handles multimodal image resolution, structured prompt parts, and candidate model fallbacks.
 */
export async function callGemini(options: CallGeminiOptions): Promise<CallGeminiResponse> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY not configured in environment");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const requestedModel = options.model || "gemini-1.5-flash";

  // Build content parts
  const parts: any[] = [];
  if (options.systemPrompt) {
    parts.push({ text: `${options.systemPrompt}\n\n` });
  }

  parts.push({ text: options.userMessage || "" });

  if (options.images && options.images.length > 0) {
    const imageParts = await resolveImageParts(options.images);
    parts.push(...imageParts);
  }

  // Candidate models to try in fallback order
  const candidates = Array.from(
    new Set([requestedModel, "gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.0-flash"])
  );

  let outputText: string | null = null;
  let usedModel = requestedModel;
  let lastError: any = null;

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
      });
      const response = await result.response;
      outputText = response.text();
      usedModel = modelName;
      if (outputText !== undefined && outputText !== null) {
        break;
      }
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || "";
      // Continue to next candidate model if 404 not found
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        continue;
      }
      throw err;
    }
  }

  if (outputText === null && lastError) {
    throw lastError;
  }

  return {
    text: outputText || "",
    model: usedModel,
  };
}
