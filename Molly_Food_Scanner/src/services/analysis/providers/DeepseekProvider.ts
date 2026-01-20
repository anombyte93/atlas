/**
 * Deepseek Provider - Direct REST client for /v1/chat/completions
 *
 * DESIGN: OpenAI-compatible API (https://api.deepseek.com)
 * Reuses OpenAI request/response patterns with Deepseek-specific configuration
 */

import {
  IAIProvider,
  FoodAnalysisInput,
  FoodAnalysisOutput,
  ChatInput,
  ChatOutput,
} from "../../ai/AIProviderStrategy";

interface DeepseekProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  retry?: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
  };
}

type DeepseekMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_RETRY = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};

const SYSTEM_PROMPT =
  "You are Molly, a food safety analyst. Return JSON with: name, summary, chemicals array (name, risk as low/medium/high, note), rating 0-100, sources array.";

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config = DEFAULT_RETRY
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      if (attempt < config.maxRetries) {
        const delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
        const jitter = Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      }
    }
  }

  throw lastError;
}

function withTimeout(timeoutMs: number): AbortController {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  controller.signal.addEventListener("abort", () => clearTimeout(timeout));
  return controller;
}

function parseJsonFromText(responseText: string): any {
  if (!responseText) {
    throw new Error("Empty response from Deepseek");
  }

  const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Continue to next pattern
    }
  }

  try {
    return JSON.parse(responseText);
  } catch {
    // Continue
  }

  const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      // Continue
    }
  }

  throw new Error(
    `Failed to parse Deepseek response. Raw: ${responseText.substring(0, 200)}...`
  );
}

function normalizeResult(data: any): FoodAnalysisOutput {
  const name = data.name || data.food_name || data.suggested_name || undefined;

  const isUncertain =
    !name ||
    name.toLowerCase().includes("unknown") ||
    name.toLowerCase().includes("unclear") ||
    name.toLowerCase().includes("product");

  const hasLowConfidence = data.confidence !== undefined && data.confidence < 0.7;

  return {
    name: isUncertain ? undefined : name,
    summary: data.summary || data.analysis || "Analysis completed.",
    chemicals: Array.isArray(data.chemicals)
      ? data.chemicals.map((c: any) => ({
          name: c.name || c.chemical || "Unknown",
          risk: c.risk === "low" || c.risk === "medium" || c.risk === "high" ? c.risk : "medium",
          note: c.note || c.description || "",
        }))
      : [],
    rating: typeof data.rating === "number" ? data.rating : 50,
    sources: Array.isArray(data.sources) ? data.sources : ["Deepseek"],
    needs_confirmation: isUncertain || hasLowConfidence,
    suggested_name: isUncertain ? data.suggested_name || "Unknown Food Product" : undefined,
  };
}

function classifyHttpError(status: number, bodyText: string): Error {
  const lower = bodyText.toLowerCase();

  if (status === 401 || lower.includes("invalid api key") || lower.includes("unauthorized")) {
    return new Error("Deepseek authentication failed. Check DEEPSEEK_API_KEY.");
  }
  if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) {
    return new Error("Deepseek rate limit exceeded. Please try again later.");
  }
  if (lower.includes("safety") || lower.includes("policy") || lower.includes("content")) {
    return new Error("Request blocked by safety filters. Try a different image.");
  }
  if (status >= 500) {
    return new Error("Deepseek server error. Please try again later.");
  }

  return new Error(`Deepseek request failed (${status}). ${bodyText.substring(0, 200)}`);
}

function buildUserMessage(input: FoodAnalysisInput): DeepseekMessage {
  const imageUrl = input.image_url || input.image_path;

  if (imageUrl) {
    return {
      role: "user",
      content: [
        {
          type: "text",
          text: "Analyze this food image and return JSON only.",
        },
        {
          type: "image_url",
          image_url: { url: imageUrl },
        },
      ],
    };
  }

  if (input.barcode_text) {
    return {
      role: "user",
      content: `Analyze this barcode: ${input.barcode_text}. Return JSON only.`,
    };
  }

  throw new Error("No image_url, image_path, or barcode_text provided");
}

export class DeepseekProvider implements IAIProvider {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly retryConfig: DeepseekProviderConfig["retry"];

  constructor(config: DeepseekProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
    this.baseUrl = config.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    this.model = config.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
    this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.retryConfig = config.retry || DEFAULT_RETRY;
  }

  getProviderName(): string {
    return "deepseek";
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async analyzeFood(input: FoodAnalysisInput): Promise<FoodAnalysisOutput> {
    if (!this.apiKey) {
      throw new Error("Deepseek API key not configured");
    }

    const messages: DeepseekMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      buildUserMessage(input),
    ];

    const content = await this.createChatCompletion(messages);
    const parsed = parseJsonFromText(content);

    return normalizeResult(parsed);
  }

  async chat(input: ChatInput): Promise<ChatOutput> {
    if (!this.apiKey) {
      throw new Error("Deepseek API key not configured");
    }

    const messages: DeepseekMessage[] = [
      { role: "system", content: "You are Molly, a food safety analyst." },
      ...input.messages.map((message): DeepseekMessage => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    ];

    const content = await this.createChatCompletion(messages);
    return { message: content.trim() };
  }

  private async createChatCompletion(messages: DeepseekMessage[]): Promise<string> {
    return retryWithBackoff(async () => {
      const controller = withTimeout(this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
          }),
          signal: controller.signal,
        });

        const text = await response.text();

        if (!response.ok) {
          throw classifyHttpError(response.status, text);
        }

        if (!text) {
          throw new Error("Empty response from Deepseek");
        }

        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Invalid JSON from Deepseek. Raw: ${text.substring(0, 200)}...`);
        }

        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) {
          throw new Error("Deepseek response missing content");
        }

        return content;
      } catch (error: any) {
        if (error?.name === "AbortError") {
          throw new Error("Deepseek request timed out. Please try again.");
        }
        throw error;
      }
    }, this.retryConfig);
  }
}

export function createDeepseekProvider(config?: DeepseekProviderConfig): DeepseekProvider {
  return new DeepseekProvider(config);
}
