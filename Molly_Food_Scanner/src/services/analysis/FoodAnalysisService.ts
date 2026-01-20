/**
 * Food Analysis Service
 *
 * WHAT: Service layer for food analysis business logic
 * WHY: Separates concerns - routes handle HTTP, service handles business logic
 * HOW: Uses AI providers via strategy pattern, handles validation, persistence
 *
 * ACADEMIC CONNECTION: Service Layer pattern (Domain-Driven Design)
 * PRODUCTION: Business logic in one place, reusable across different interfaces (API, CLI, web)
 */

import { IAIProvider, FoodAnalysisOutput } from "../ai/AIProviderStrategy";
import { getAIProvider } from "../ai/AIProviderFactory";
import { StorageService, ImageEntry } from "../storage/StorageService";

/**
 * Analysis request from API
 */
export type AnalyzeFoodRequest = {
  image_url?: string;
  barcode_text?: string;
  save_to_db?: boolean;
};

/**
 * Analysis response with metadata
 */
export type AnalyzeFoodResponse = {
  name?: string;
  barcode?: string;
  rating: number;
  summary: string;
  chemicals: Array<{
    name: string;
    risk: "low" | "medium" | "high";
    note: string;
  }>;
  sources: string[];
  needs_confirmation: boolean;
  suggested_name?: string | null;
  image_id?: string;
  provider?: string;
};

/**
 * Service layer for food analysis
 *
 * DESIGN PATTERNS:
 * - Service Layer: Encapsulates business logic
 * - Dependency Injection: Accepts AI provider and storage for testability
 * - Orchestration: Coordinates between AI and storage
 */
export class FoodAnalysisService {
  private aiProvider: IAIProvider | null = null;
  private storage: StorageService;

  constructor(storage?: StorageService) {
    // Dependency Injection with defaults
    // AI provider will be lazily initialized via ensureAIProvider()
    this.storage = storage || new StorageService();
  }

  /**
   * Ensure AI provider is initialized
   * Lazy initialization pattern
   */
  private async ensureAIProvider(): Promise<void> {
    if (!this.aiProvider) {
      this.aiProvider = await getAIProvider();
    }
  }

  /**
   * Set AI provider (useful for testing or runtime switching)
   */
  setAIProvider(provider: IAIProvider): void {
    this.aiProvider = provider;
  }

  /**
   * Analyze food from image or barcode
   *
   * WORKFLOW:
   * 1. Validate input
   * 2. Call AI provider
   * 3. Optionally save to database
   * 4. Return normalized response
   *
   * ASYNC: Non-blocking, enables concurrent requests
   */
  async analyzeFood(request: AnalyzeFoodRequest): Promise<AnalyzeFoodResponse> {
    // Step 1: Validate input
    this.validateRequest(request);

    // Step 1.5: Ensure AI provider is initialized (lazy loading)
    await this.ensureAIProvider();

    // Step 2: Prepare input for AI
    const aiInput = this.prepareAIInput(request);

    // Step 3: Call AI provider (async, non-blocking)
    // After ensureAIProvider(), aiProvider is guaranteed to be non-null
    const startTime = Date.now();
    const aiResult = await this.aiProvider!.analyzeFood(aiInput);
    const duration = Date.now() - startTime;

    // Log for observability
    console.log(`[FoodAnalysisService] Analysis completed in ${duration}ms via ${this.aiProvider!.getProviderName()}`);

    // Step 4: Save to database if requested
    let imageId: string | undefined;
    if (request.save_to_db && request.image_url) {
      imageId = await this.saveAnalysis(request.image_url, aiResult);
    }

    // Step 5: Return normalized response
    return {
      name: aiResult.name,
      barcode: request.barcode_text,
      rating: aiResult.rating,
      summary: aiResult.summary,
      chemicals: aiResult.chemicals,
      sources: aiResult.sources,
      needs_confirmation: aiResult.needs_confirmation ?? false,
      suggested_name: aiResult.suggested_name ?? null,
      image_id: imageId,
      provider: this.aiProvider!.getProviderName(),
    };
  }

  /**
   * Batch analyze multiple images
   *
   * CONCURRENT PROCESSING: Process multiple images in parallel
   * PRODUCTION: Significantly faster than sequential processing
   */
  async analyzeBatch(requests: AnalyzeFoodRequest[]): Promise<AnalyzeFoodResponse[]> {
    // Process all requests concurrently
    const promises = requests.map((req) => this.analyzeFood(req));
    return Promise.all(promises);
  }

  /**
   * Validate request input
   *
   * DEFENSIVE PROGRAMMING: Fail fast with clear error messages
   */
  private validateRequest(request: AnalyzeFoodRequest): void {
    if (!request.image_url && !request.barcode_text) {
      throw new Error("Either image_url or barcode_text is required");
    }

    if (request.image_url) {
      // Prevent directory traversal attacks
      const safeUrl = request.image_url.replace(/\.\./g, "").replace(/\/+/g, "/");
      if (!safeUrl.startsWith("/uploads/")) {
        throw new Error("Invalid image URL: must start with /uploads/");
      }
    }
  }

  /**
   * Prepare input for AI provider
   * Maps API request to AI provider format
   */
  private prepareAIInput(request: AnalyzeFoodRequest) {
    return {
      image_url: request.image_url,
      barcode_text: request.barcode_text,
    };
  }

  /**
   * Save analysis result to database
   *
   * PERSISTENCE: Delegates to storage service
   * ASYNC: Non-blocking database write
   */
  private async saveAnalysis(imageUrl: string, result: FoodAnalysisOutput): Promise<string> {
    // Extract image ID from URL or generate new one
    const imageId = this.extractImageId(imageUrl);

    await this.storage.updateImageAnalysis(imageId, {
      name: result.name,
      barcode: undefined, // Would come from request if available
      rating: result.rating,
      summary: result.summary,
      chemicals: result.chemicals,
      sources: result.sources,
      needs_confirmation: result.needs_confirmation,
      suggested_name: result.suggested_name,
    });

    return imageId;
  }

  /**
   * Extract image ID from URL
   * Simple extraction logic - can be enhanced
   */
  private extractImageId(imageUrl: string): string {
    const parts = imageUrl.split("/");
    const filename = parts[parts.length - 1];
    return filename.split(".")[0]; // Remove extension
  }
}

/**
 * Default service instance
 * Singleton for application-wide use
 */
let defaultService: FoodAnalysisService | null = null;

/**
 * Get or create default service
 */
export function getFoodAnalysisService(): FoodAnalysisService {
  if (!defaultService) {
    defaultService = new FoodAnalysisService();
  }
  return defaultService;
}
