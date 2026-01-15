import { NextResponse } from "next/server";
import { readDb, writeDb } from "../_lib/storage";

export const runtime = "nodejs";

function normalize(items: unknown[]): string[] {
  const values = items
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0)
    .map((item) => item.toLowerCase());

  return Array.from(new Set(values));
}

export async function GET() {
  try {
    const db = await readDb();
    return NextResponse.json(db.preferences);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to load preferences.", details: err?.message || "Unknown" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const db = await readDb();

    const avoidFoods = normalize(
      Array.isArray(body?.avoidFoods) ? body.avoidFoods : []
    );
    const allergens = normalize(
      Array.isArray(body?.allergens) ? body.allergens : []
    );

    const addAvoid = normalize(
      Array.isArray(body?.addAvoid) ? body.addAvoid : []
    );
    const removeAvoid = normalize(
      Array.isArray(body?.removeAvoid) ? body.removeAvoid : []
    );
    const addAllergens = normalize(
      Array.isArray(body?.addAllergens) ? body.addAllergens : []
    );
    const removeAllergens = normalize(
      Array.isArray(body?.removeAllergens) ? body.removeAllergens : []
    );

    const mergedAvoid = new Set(
      avoidFoods.length ? avoidFoods : db.preferences.avoidFoods
    );
    addAvoid.forEach((item) => mergedAvoid.add(item));
    removeAvoid.forEach((item) => mergedAvoid.delete(item));

    const mergedAllergens = new Set(
      allergens.length ? allergens : db.preferences.allergens
    );
    addAllergens.forEach((item) => mergedAllergens.add(item));
    removeAllergens.forEach((item) => mergedAllergens.delete(item));

    db.preferences = {
      avoidFoods: Array.from(mergedAvoid),
      allergens: Array.from(mergedAllergens),
    };

    await writeDb(db);

    return NextResponse.json(db.preferences);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to update preferences.", details: err?.message || "Unknown" },
      { status: 500 }
    );
  }
}
