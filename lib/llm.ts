import { GoogleGenerativeAI } from "@google/generative-ai";
import { LLMProvider } from "./types";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}

export interface CallLLMOptions {
  provider?: LLMProvider;
  model?: string;
  systemPrompt?: string;
  userMessage: string;
  images?: string[];
}

export interface CallLLMResponse {
  text: string;
  model: string;
  provider: LLMProvider;
  usage?: TokenUsage;
}

export type CallGeminiOptions = Omit<CallLLMOptions, "provider">;
export interface CallGeminiResponse {
  text: string;
  model: string;
  usage?: TokenUsage;
}

/**
 * Calculates estimated cost in USD based on model pricing per million tokens
 */
export function estimateCost(
  provider: LLMProvider,
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const normModel = model.toLowerCase();
  let inputCostPerMillion = 0.15;
  let outputCostPerMillion = 0.60;

  if (provider === "gemini") {
    if (normModel.includes("pro")) {
      inputCostPerMillion = 1.25;
      outputCostPerMillion = 5.0;
    } else {
      // flash
      inputCostPerMillion = 0.075;
      outputCostPerMillion = 0.30;
    }
  } else if (provider === "openai") {
    if (normModel.includes("4o-mini")) {
      inputCostPerMillion = 0.15;
      outputCostPerMillion = 0.60;
    } else if (normModel.includes("4o") || normModel.includes("gpt-4")) {
      inputCostPerMillion = 2.50;
      outputCostPerMillion = 10.0;
    } else if (normModel.includes("o1")) {
      inputCostPerMillion = 15.0;
      outputCostPerMillion = 60.0;
    } else {
      inputCostPerMillion = 0.50;
      outputCostPerMillion = 1.50;
    }
  } else if (provider === "anthropic") {
    if (normModel.includes("haiku")) {
      inputCostPerMillion = 0.80;
      outputCostPerMillion = 4.0;
    } else if (normModel.includes("opus")) {
      inputCostPerMillion = 15.0;
      outputCostPerMillion = 75.0;
    } else {
      // sonnet default
      inputCostPerMillion = 3.0;
      outputCostPerMillion = 15.0;
    }
  }

  const cost =
    (promptTokens / 1_000_000) * inputCostPerMillion +
    (completionTokens / 1_000_000) * outputCostPerMillion;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * Rough token estimator for text (~4 chars per token) and images (~250-800 tokens)
 */
function estimateTokensFromText(text: string, imageCount: number = 0): number {
  const textTokens = Math.max(1, Math.ceil((text || "").length / 4));
  const imageTokens = imageCount * 300;
  return textTokens + imageTokens;
}

/**
 * Resolves a list of image URLs (base64 data URIs or remote HTTP/HTTPS URLs) into raw base64 and mimeType.
 * Remote URLs are fetched server-side with timeout and size guards.
 */
async function resolveRawImages(images: string[]): Promise<Array<{ base64: string; mimeType: string; dataUri: string }>> {
  if (!images || images.length === 0) return [];

  const maxImages = Math.min(4, images.length);
  const selectedUrls = images.slice(0, maxImages);

  const tasks = selectedUrls.map(async (imageUrl) => {
    try {
      if (typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
        const match = imageUrl.match(/^data:(.*?);base64,(.*)$/);
        if (match) {
          const mimeType = match[1] || "image/jpeg";
          const base64 = match[2] || "";
          return { base64, mimeType, dataUri: imageUrl };
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
        return { base64, mimeType, dataUri: `data:${mimeType};base64,${base64}` };
      }

      return null;
    } catch {
      return null;
    }
  });

  const settled = await Promise.allSettled(tasks);
  const results: Array<{ base64: string; mimeType: string; dataUri: string }> = [];

  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) {
      results.push(result.value);
    }
  }

  return results;
}

/**
 * Execute Google Gemini models with fallback and multimodal support
 */
async function executeGemini(options: CallLLMOptions): Promise<CallLLMResponse> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY not configured in environment");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const requestedModel = options.model || "gemini-1.5-flash";

  const rawImages = options.images ? await resolveRawImages(options.images) : [];
  const parts: any[] = [];
  if (options.systemPrompt) {
    parts.push({ text: `${options.systemPrompt}\n\n` });
  }
  parts.push({ text: options.userMessage || "" });

  for (const img of rawImages) {
    parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
  }

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
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        continue;
      }
      throw err;
    }
  }

  if (outputText === null && lastError) {
    throw lastError;
  }

  const promptText = (options.systemPrompt ? options.systemPrompt + "\n" : "") + (options.userMessage || "");
  const promptTokens = estimateTokensFromText(promptText, rawImages.length);
  const completionTokens = estimateTokensFromText(outputText || "");
  const totalTokens = promptTokens + completionTokens;
  const cost = estimateCost("gemini", usedModel, promptTokens, completionTokens);

  return {
    text: outputText || "",
    model: usedModel,
    provider: "gemini",
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost: cost,
    },
  };
}

/**
 * Execute OpenAI chat completions with multimodal support
 */
async function executeOpenAI(options: CallLLMOptions): Promise<CallLLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured in environment");
  }

  const modelName = options.model || "gpt-4o-mini";
  const rawImages = options.images ? await resolveRawImages(options.images) : [];

  const messages: any[] = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  const userContent: any[] = [{ type: "text", text: options.userMessage || "" }];
  for (const img of rawImages) {
    userContent.push({
      type: "image_url",
      image_url: { url: img.dataUri },
    });
  }
  messages.push({ role: "user", content: userContent });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
    }),
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(
      errorJson?.error?.message || `OpenAI API error: HTTP ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  const promptTokens = data?.usage?.prompt_tokens ?? estimateTokensFromText(options.userMessage, rawImages.length);
  const completionTokens = data?.usage?.completion_tokens ?? estimateTokensFromText(text);
  const totalTokens = data?.usage?.total_tokens ?? (promptTokens + completionTokens);
  const cost = estimateCost("openai", modelName, promptTokens, completionTokens);

  return {
    text,
    model: data.model || modelName,
    provider: "openai",
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost: cost,
    },
  };
}

/**
 * Execute Anthropic Messages API with multimodal support
 */
async function executeAnthropic(options: CallLLMOptions): Promise<CallLLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured in environment");
  }

  const modelName = options.model || "claude-3-5-sonnet-20241022";
  const rawImages = options.images ? await resolveRawImages(options.images) : [];

  const userContent: any[] = [];
  for (const img of rawImages) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType,
        data: img.base64,
      },
    });
  }
  userContent.push({ type: "text", text: options.userMessage || "" });

  const body: any = {
    model: modelName,
    max_tokens: 4096,
    messages: [{ role: "user", content: userContent }],
  };

  if (options.systemPrompt) {
    body.system = options.systemPrompt;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(
      errorJson?.error?.message || `Anthropic API error: HTTP ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  const textBlock = data?.content?.find((c: any) => c.type === "text");
  const text = textBlock ? textBlock.text : "";
  const promptTokens = data?.usage?.input_tokens ?? estimateTokensFromText(options.userMessage, rawImages.length);
  const completionTokens = data?.usage?.output_tokens ?? estimateTokensFromText(text);
  const totalTokens = promptTokens + completionTokens;
  const cost = estimateCost("anthropic", modelName, promptTokens, completionTokens);

  return {
    text,
    model: data.model || modelName,
    provider: "anthropic",
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost: cost,
    },
  };
}

/**
 * Unified single shared function for calling LLM models across Gemini, OpenAI, and Anthropic.
 */
export async function callLLM(options: CallLLMOptions): Promise<CallLLMResponse> {
  const provider = options.provider || "gemini";

  switch (provider) {
    case "gemini":
      return executeGemini(options);
    case "openai":
      return executeOpenAI(options);
    case "anthropic":
      return executeAnthropic(options);
    default:
      return executeGemini(options);
  }
}

/**
 * Backward-compatible helper for calling Google Gemini
 */
export async function callGemini(options: CallGeminiOptions): Promise<CallGeminiResponse> {
  const result = await callLLM({ ...options, provider: "gemini" });
  return {
    text: result.text,
    model: result.model,
    usage: result.usage,
  };
}

