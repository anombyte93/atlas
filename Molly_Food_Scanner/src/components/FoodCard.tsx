"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface FoodCardProps {
  data?: {
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
  };
}

type Chemical = {
  name: string;
  risk: "low" | "medium" | "high";
  note: string;
};

type FoodAnalysis = {
  name: string;
  barcode: string;
  rating: number;
  summary: string;
  chemicals: Chemical[];
  sources: string[];
};

const sampleFood: FoodAnalysis = {
  name: "Sparkling Citrus Water",
  barcode: "0192837465012",
  rating: 38,
  summary:
    "Contains artificial sweeteners and preservatives. Moderate consumption advised.",
  chemicals: [
    {
      name: "Sucralose",
      risk: "medium",
      note: "Artificial sweetener linked to glucose response changes.",
    },
    {
      name: "Sodium benzoate",
      risk: "medium",
      note: "Preservative that can irritate sensitive stomachs.",
    },
    {
      name: "Yellow 5",
      risk: "high",
      note: "Synthetic color additive with mixed safety studies.",
    },
  ],
  sources: ["FDA Food Additive Database", "WHO Food Additives"],
};

export default function FoodCard({ data }: FoodCardProps) {
  const [showChemicals, setShowChemicals] = useState(false);

  // Use props data if provided, otherwise use sample data
  const foodData = data || sampleFood;

  const ratingStatus = useMemo(() => {
    const rating = foodData.rating || 0;
    if (rating >= 70) return { label: "Good", tone: "bg-emerald-500" };
    if (rating >= 45) return { label: "Mixed", tone: "bg-amber-500" };
    return { label: "Bad", tone: "bg-rose-500" };
  }, [foodData.rating]);

  // Show loading state if data is being analyzed but not yet available
  if (data && !data.name && !data.rating) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Analyzing...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{foodData.name || "Unknown Food"}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Barcode: {foodData.barcode || "Not detected"}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {ratingStatus.label}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Health rating</span>
            <span>{(foodData.rating || 0)}/100</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${ratingStatus.tone}`}
              style={{ width: `${foodData.rating || 0}%` }}
              role="meter"
              aria-valuenow={foodData.rating || 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Food rating"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {foodData.summary ? (
          <Alert>
            <AlertTitle>Summary</AlertTitle>
            <AlertDescription>{foodData.summary}</AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertTitle>No Analysis Available</AlertTitle>
            <AlertDescription>Upload an image to get food analysis</AlertDescription>
          </Alert>
        )}

        {(foodData.chemicals && foodData.chemicals.length > 0) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Chemicals found</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowChemicals((prev) => !prev)}
              >
                {showChemicals ? "Hide" : "View"} ({foodData.chemicals?.length || 0})
              </Button>
            </div>
            {showChemicals ? (
              <div className="space-y-3">
                {foodData.chemicals.map((chemical) => (
                  <div
                    key={chemical.name}
                    className="rounded-lg border bg-muted/40 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{chemical.name}</p>
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase"
                      >
                        {chemical.risk}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {chemical.note}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-3">
        <Button type="button">Add to bad foods</Button>
        {foodData.sources && foodData.sources.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Sources: {foodData.sources.join(", ")}
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
