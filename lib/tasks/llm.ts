import { callLLM, TokenUsage } from "@/lib/llm";
import { LLMProvider } from "../types";

export interface RunLLMPayload {
  provider?: LLMProvider;
  model?: string;
  systemPrompt?: string;
  userMessage: string;
  images?: string[];
}

export interface RunLLMResult {
  success: boolean;
  output?: string;
  model?: string;
  provider?: LLMProvider;
  usage?: TokenUsage;
  duration: number;
  error?: string;
}

export async function runLLM(payload: RunLLMPayload): Promise<RunLLMResult> {
  const startTime = Date.now();
  try {
    const res = await callLLM({
      provider: payload.provider,
      model: payload.model,
      systemPrompt: payload.systemPrompt,
      userMessage: payload.userMessage,
      images: payload.images,
    });

    return {
      success: true,
      output: res.text,
      model: res.model,
      provider: res.provider,
      usage: res.usage,
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


