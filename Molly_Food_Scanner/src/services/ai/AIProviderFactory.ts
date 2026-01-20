/**
 * AI Provider Factory
 *
 * WHAT: Factory that creates the right AI provider based on configuration
 * WHY: Decouples provider selection from business logic (Dependency Inversion)
 * HOW: Reads config/environment, returns provider implementing IAIProvider
 *
 * ACADEMIC CONNECTION: Factory Method + Dependency Injection patterns
 * PRODUCTION: Add new providers without modifying existing code (Open/Closed)
 */

import { IAIProvider } from "./AIProviderStrategy";
import { GeminiAIProvider, createGeminiProvider } from "./GeminiAIProvider";
import { McpProvider, createMcpProvider } from "../analysis/providers/McpProvider";
import { OpenAiProvider, createOpenAiProvider } from "../analysis/providers/OpenAiProvider";
import { LocalProvider, createLocalProvider } from "../analysis/providers/LocalProvider";
import { DeepseekProvider, createDeepseekProvider } from "../analysis/providers/DeepseekProvider";

/**
 * Provider type enumeration
 * Type-safe provider selection
 */
export type AIProviderType = "gemini" | "claude" | "mcp" | "openai" | "deepseek" | "local" | "auto";

/**
 * Factory configuration
 */
export interface AIProviderConfig {
  type: AIProviderType;
  geminiScriptPath?: string;
  mcpUrl?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
  fallbackProvider?: AIProviderType;
}

/**
 * Default configuration
 * Can be overridden by environment variables
 */
const DEFAULT_CONFIG: AIProviderConfig = {
  type: (process.env.MFS_AI_PROVIDER as AIProviderType) || "deepseek",
  geminiScriptPath: process.env.MFS_GEMINI_SCRIPT || "~/.claude/scripts/gemini-exec.sh",
  mcpUrl: process.env.MFS_MCP_URL || "http://localhost:8080",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL,
  openaiModel: process.env.OPENAI_MODEL,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL,
  deepseekModel: process.env.DEEPSEEK_MODEL,
  fallbackProvider: (process.env.MFS_AI_FALLBACK as AIProviderType) || "openai",
};

/**
 * AI Provider Factory
 *
 * DESIGN PATTERNS:
 * - Factory Pattern: Centralized provider creation
 * - Dependency Injection: Config injected for testability
 * - Fallback Pattern: Graceful degradation if primary fails
 */
export class AIProviderFactory {
  private config: AIProviderConfig;
  private cache: Map<AIProviderType, IAIProvider> = new Map();

  constructor(config: Partial<AIProviderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create provider instance
   *
   * CACHING: Reuse provider instances (they may hold connections)
   * SINGLETON: One instance per provider type
   */
  async createProvider(type?: AIProviderType): Promise<IAIProvider> {
    const providerType = type || this.config.type;

    // Return cached instance if available
    if (this.cache.has(providerType)) {
      return this.cache.get(providerType)!;
    }

    const provider = this.buildProvider(providerType);

    // Cache for reuse
    this.cache.set(providerType, provider);

    return provider;
  }

  /**
   * Build provider based on type
   *
   * EXTENSIBILITY: Add new providers here (Claude, local, etc.)
   * OPEN/CLOSED: Open for extension, closed for modification
   */
  private buildProvider(type: AIProviderType): IAIProvider {
    switch (type) {
      case "gemini":
        return createGeminiProvider({
          scriptPath: this.config.geminiScriptPath,
        });

      case "mcp":
        return createMcpProvider({
          mcpUrl: this.config.mcpUrl,
        });

      case "openai":
        return createOpenAiProvider({
          apiKey: this.config.openaiApiKey,
          baseUrl: this.config.openaiBaseUrl,
          model: this.config.openaiModel,
        });

      case "deepseek":
        return createDeepseekProvider({
          apiKey: this.config.deepseekApiKey,
          baseUrl: this.config.deepseekBaseUrl,
          model: this.config.deepseekModel,
        });

      case "local":
        return createLocalProvider();

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Get provider with fallback
   * If primary unavailable, try fallback
   */
  async getProviderWithFallback(): Promise<IAIProvider> {
    try {
      const primary = await this.createProvider();
      const available = await primary.isAvailable();

      if (available) {
        return primary;
      }

      // Try fallback
      if (this.config.fallbackProvider && this.config.fallbackProvider !== this.config.type) {
        console.warn(`Primary provider unavailable, trying fallback: ${this.config.fallbackProvider}`);
        return await this.createProvider(this.config.fallbackProvider);
      }

      throw new Error(`No available AI provider`);
    } catch (error) {
      throw new Error(`Failed to create AI provider: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear cache (useful for testing or config changes)
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Default factory instance
 * Singleton pattern for application-wide use
 */
let defaultFactory: AIProviderFactory | null = null;

/**
 * Get or create default factory
 */
export function getAIProviderFactory(): AIProviderFactory {
  if (!defaultFactory) {
    defaultFactory = new AIProviderFactory();
  }
  return defaultFactory;
}

/**
 * Convenience function: Get provider with defaults
 *
 * USAGE:
 * ```ts
 * const provider = await getAIProvider();
 * const result = await provider.analyzeFood({ image_path: "/path/to/image.jpg" });
 * ```
 */
export async function getAIProvider(type?: AIProviderType): Promise<IAIProvider> {
  const factory = getAIProviderFactory();
  return await factory.createProvider(type);
}
