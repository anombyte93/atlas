import { NextResponse } from "next/server";
import { analyzeWithGemini } from "../_lib/gemini-analyzer";
import fs from "fs/promises";

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { image_url, barcode_text } = body;

    if (!image_url && !barcode_text) {
      return NextResponse.json(
        { error: "Provide image_url or barcode_text" },
        { status: 400 }
      );
    }

    // Validate image_url is safe (prevent directory traversal)
    const safeImageUrl = image_url?.replace(/\.\./g, '').replace(/\/+/g, '/');
    if (!safeImageUrl?.startsWith('/uploads/')) {
      return NextResponse.json(
        { error: "Invalid image URL" },
        { status: 400 }
      );
    }

    // Call real Gemini analyzer
    const image_path = image_url
      ? `${process.cwd()}/public${safeImageUrl}`
      : undefined;

    // Verify file exists before analysis
    if (image_path) {
      try {
        await fs.access(image_path, fs.constants.F_OK);
      } catch {
        return NextResponse.json(
          { error: "Image file not found", details: `Could not access ${image_url}` },
          { status: 404 }
        );
      }
    }

    const result = await analyzeWithGemini({
      image_url,
      barcode_text,
      image_path,
    });

    // Return analysis with confirmation flag
    return NextResponse.json({
      name: result.name,
      barcode: barcode_text,
      rating: result.rating,
      summary: result.summary,
      chemicals: result.chemicals,
      sources: result.sources,
      needs_confirmation: result.needs_confirmation ?? false,
      suggested_name: result.suggested_name ?? null,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('Operation failed:', errorMessage, stack || '');

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
    }

    return NextResponse.json(
      { 
        error: "Food analysis failed", 
        details: errorMessage,
        suggestion 
      },
      { status }
    );
  }
}
