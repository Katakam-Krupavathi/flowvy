import { callGemini } from "@/lib/llm";

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
  try {
    const res = await callGemini({
      model: payload.model,
      systemPrompt: payload.systemPrompt,
      userMessage: payload.userMessage,
      images: payload.images,
    });

    return {
      success: true,
      output: res.text,
      model: res.model,
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

