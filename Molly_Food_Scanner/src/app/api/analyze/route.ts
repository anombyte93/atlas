/**
 * Food Analysis API Route
 *
 * REFACTORED: Now uses service layer instead of direct AI calls
 *
 * ARCHITECTURE IMPROVEMENTS:
 * - Route handles HTTP concerns only (validation, response formatting)
 * - Service layer handles business logic (AI calls, persistence)
 * - Strategy pattern enables provider swapping without code changes
 * - Async throughout, no blocking operations
 */

import { NextResponse } from "next/server";
import { getFoodAnalysisService } from "@/services/analysis/FoodAnalysisService";
import { FoodAnalysisService } from "@/services/analysis/FoodAnalysisService";
import { readDb, writeDb } from "../_lib/storage";
import fs from "fs/promises";

export const runtime = "nodejs";

/**
 * POST /api/analyze
 *
 * Analyze food from image or barcode
 *
 * @param {string} image_url - URL to uploaded image (optional)
 * @param {string} barcode_text - Barcode text (optional)
 * @returns {FoodAnalysisResponse} Analysis results with rating, chemicals, etc.
 */
export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await req.json();
    const { image_url, barcode_text } = body;

    // Step 1: Validate input (route layer responsibility)
    if (!image_url && !barcode_text) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: "Either image_url or barcode_text is required",
        },
        { status: 400 }
      );
    }

    // Step 2: Security validation (prevent directory traversal)
    if (image_url) {
      const safeImageUrl = image_url.replace(/\.\./g, "").replace(/\/+/g, "/");
      if (!safeImageUrl.startsWith("/uploads/")) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: "Invalid image URL: must start with /uploads/",
          },
          { status: 400 }
        );
      }
    }

    // Step 3: Verify file exists (if image provided)
    let imagePath: string | undefined;
    if (image_url) {
      imagePath = `${process.cwd()}/public${image_url}`;
      try {
        await fs.access(imagePath, fs.constants.F_OK);
      } catch {
        return NextResponse.json(
          {
            error: "File not found",
            details: `Image file not found: ${image_url}`,
          },
          { status: 404 }
        );
      }
    }

    // Step 4: Call service layer (business logic)
    // DEPENDENCY INJECTION: Service handles AI provider selection
    const service = getFoodAnalysisService();
    const result = await service.analyzeFood({
      image_url,
      barcode_text,
      save_to_db: false, // Don't auto-save, we'll save manually below
    });

    // Step 5: Save analysis to database for chat context
    const db = await readDb();
    const analysisId = crypto.randomUUID();

    // Create or update image entry with analysis result
    if (image_url) {
      // Find existing image entry by URL or create new one
      let imageEntry = db.images?.find((img: any) => img.url === image_url);

      if (imageEntry) {
        // Update existing entry
        imageEntry.analysisResult = {
          name: result.name,
          barcode: result.barcode,
          rating: result.rating,
          summary: result.summary,
          chemicals: result.chemicals,
          sources: result.sources,
          needs_confirmation: result.needs_confirmation,
          suggested_name: result.suggested_name,
        };
      } else {
        // Extract filename from URL for new entry
        const filename = image_url.split('/').pop() || 'unknown';
        imageEntry = {
          id: analysisId,
          filename,
          url: image_url,
          uploadedAt: new Date().toISOString(),
          analysisResult: {
            name: result.name,
            barcode: result.barcode,
            rating: result.rating,
            summary: result.summary,
            chemicals: result.chemicals,
            sources: result.sources,
            needs_confirmation: result.needs_confirmation,
            suggested_name: result.suggested_name,
          }
        };

        // Initialize images array if needed
        if (!db.images) db.images = [];
        db.images.unshift(imageEntry);
      }

      await writeDb(db);
    }

    // Step 6: Log for observability
    const duration = Date.now() - startTime;
    console.log(`[API] /api/analyze completed in ${duration}ms via ${result.provider}`);

    // Step 7: Return response with ID
    return NextResponse.json({
      id: analysisId,
      name: result.name,
      barcode: result.barcode,
      rating: result.rating,
      summary: result.summary,
      chemicals: result.chemicals,
      sources: result.sources,
      needs_confirmation: result.needs_confirmation,
      suggested_name: result.suggested_name,
    });

  } catch (error: unknown) {
    // Centralized error handling
    return handleError(error, "Food analysis failed");
  }
}

/**
 * Error handler
 *
 * PATTERN: Centralized error handling for consistent responses
 * ACADEMIC: Error handling middleware pattern
 */
function handleError(error: unknown, context: string) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`[API Error] ${context}:`, errorMessage, stack || "");

  // Determine appropriate status code and user-friendly message
  let suggestion = "Please try again with a clearer image or different angle.";
  let status = 500;

  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes("rate limit") || lowerError.includes("quota")) {
    suggestion = "The AI service is busy. Please wait a moment and try again.";
    status = 429;
  } else if (lowerError.includes("safety") || lowerError.includes("blocked")) {
    suggestion = "The image was flagged by safety filters. Please try a different food image.";
    status = 400;
  } else if (lowerError.includes("authentication") || lowerError.includes("auth")) {
    suggestion = "Service configuration error. Please contact support.";
    status = 503;
  } else if (lowerError.includes("valid json") || lowerError.includes("parse")) {
    suggestion = "The AI response was malformed. This happens occasionally, please retry.";
    status = 502;
  } else if (lowerError.includes("timeout")) {
    suggestion = "The analysis took too long. Please try with a smaller image or try again.";
    status = 408;
  }

  return NextResponse.json(
    {
      error: context,
      details: errorMessage,
      suggestion,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
