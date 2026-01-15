"use client";

import { useState } from "react";
import UploadArea from "@/components/UploadArea";
import ChatInterface from "@/components/ChatInterface";
import FoodCard from "@/components/FoodCard";

interface AnalysisResult {
  name?: string;
  barcode?: string;
  rating?: number;
  summary?: string;
  chemicals?: Array<{
    name: string;
    risk: "low" | "medium" | "high";
    note: string;
  }>;
  sources?: string[];
  entryId?: string;
}

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const handleUploadComplete = (imageUrl: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    // Call analyze API with the uploaded image URL
    fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image_url: imageUrl }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(response.statusText || "Analysis failed");
        }
        return response.json();
      })
      .then((data) => {
        setAnalysisResult(data);
      })
      .catch((error) => {
        setAnalysisError(error.message || "Failed to analyze food");
        console.error("Analysis error:", error);
      })
      .finally(() => {
        setIsAnalyzing(false);
      });
  };

  const resetAnalysis = () => {
    setAnalysisResult(null);
    setAnalysisError(null);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Molly Food Scanner
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Is this food bad for me?
          </h1>
          <p className="max-w-2xl text-slate-300">
            Upload a photo or scan a barcode, then chat with the AI to understand
            ingredients, additives, and personalized impact.
          </p>
        </header>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <UploadArea
              onUploadComplete={handleUploadComplete}
              onReset={resetAnalysis}
            />
            <div className="mt-6">
              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center space-y-2 py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-primary" />
                  <p className="text-sm text-muted-foreground">
                    Analyzing your food...
                  </p>
                </div>
              )}

              {analysisError && (
                <div className="rounded-lg border border-red-900 bg-red-900/20 p-4">
                  <p className="text-sm text-red-300">Analysis failed: {analysisError}</p>
                  <button
                    onClick={resetAnalysis}
                    className="mt-2 text-sm text-red-400 hover:text-red-300"
                  >
                    Try again
                  </button>
                </div>
              )}

              {analysisResult && (
                <FoodCard data={analysisResult} />
              )}

              {!analysisResult && !isAnalyzing && !analysisError && (
                <FoodCard />
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <ChatInterface />
          </div>
        </section>
      </div>
    </main>
  );
}
