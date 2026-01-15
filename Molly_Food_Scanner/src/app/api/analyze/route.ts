import { NextResponse } from "next/server";
import { callMcpAnalyze, callOpenAIAnalyze } from "../_lib/mcp";
import { readDb, writeDb } from "../_lib/storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const image_url = typeof body?.image_url === "string" ? body.image_url : undefined;
    const barcode_text =
      typeof body?.barcode_text === "string" ? body.barcode_text : undefined;

    if (!image_url && !barcode_text) {
      return NextResponse.json(
        { error: "Provide image_url or barcode_text." },
        { status: 400 }
      );
    }

    const abortController = new AbortController();
    const payload = { image_url, barcode_text };

    const mcpResult = await callMcpAnalyze(payload, abortController.signal);
    const aiResult = mcpResult || (await callOpenAIAnalyze(payload, abortController.signal));

    const analysisResult = aiResult || {
      analysis:
        "Unable to reach AI service. Provide ingredient list or try again later.",
      chemicals: [],
      rating: "unknown",
      source: "fallback",
    };

    const db = await readDb();
    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      image_url,
      barcode_text,
      analysis: analysisResult.analysis,
      chemicals: analysisResult.chemicals,
      rating: analysisResult.rating,
      source: analysisResult.source,
    };
    db.analyses.unshift(entry);
    await writeDb(db);

    return NextResponse.json({
      ...analysisResult,
      entryId: entry.id,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to analyze food.", details: err?.message || "Unknown" },
      { status: 500 }
    );
  }
}
