import { task } from "@trigger.dev/sdk/v3";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface RunLLMPayload {
  model?: string;
  systemPrompt?: string;
  userMessage: string;
  images?: string[];
}

export interface RunLLMResult {
  success: boolean;
  output?: string;
  model?: string;
  duration: number;
  error?: string;
}

export async function runLLM(payload: RunLLMPayload): Promise<RunLLMResult> {
  const startTime = Date.now();
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: "GOOGLE_AI_API_KEY not configured",
      duration: Date.now() - startTime,
    };
  }

  const modelName = payload.model || "gemini-1.5-flash";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Build parts array for multimodal input
    const parts: any[] = [];

    if (payload.systemPrompt) {
      parts.push({ text: `${payload.systemPrompt}\n\n` });
    }

    parts.push({ text: payload.userMessage || "" });

    if (payload.images && payload.images.length > 0) {
      const maxImages = Math.min(4, payload.images.length);
      const urls = payload.images.slice(0, maxImages);

      const tasks = urls.map(async (imageUrl) => {
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
            const ct = res.headers.get("content-type") || "";
            if (!ct.toLowerCase().startsWith("image/")) return null;

            const buffer = await res.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const mimeType = ct || "image/jpeg";
            return { inlineData: { data: base64, mimeType } };
          }

          return null;
        } catch {
          return null;
        }
      });

      const results = await Promise.allSettled(tasks);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          parts.push(r.value);
        }
      }
    }

    // Try primary model using SDK
    const candidateModels = Array.from(
      new Set([modelName, "gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.0-flash"])
    );

    let text = "";
    let lastError: any = null;

    for (const name of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: name });
        const result = await model.generateContent({
          contents: [{ role: "user", parts }],
        });
        const response = await result.response;
        text = response.text();
        if (text !== undefined && text !== null) {
          return {
            success: true,
            output: text,
            model: name,
            duration: Date.now() - startTime,
          };
        }
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || "";
        // Continue to fallback candidate if model not found
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          continue;
        }
        // If other error, throw to outer catch
        throw err;
      }
    }

    if (!text && lastError) {
      throw lastError;
    }

    return {
      success: true,
      output: text,
      model: modelName,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "LLM execution failed",
      duration: Date.now() - startTime,
    };
  }
}

export const runLLMTask = task({
  id: "run-llm",
  run: async (
    payload: {
      model?: string;
      systemPrompt?: string;
      userMessage: string;
      images?: string[];
    },
    { ctx }
  ) => {
    return await runLLM(payload);
  },
});
