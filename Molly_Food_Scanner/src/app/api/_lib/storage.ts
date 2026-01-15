import fs from "fs/promises";
import path from "path";

export type AnalysisEntry = {
  id: string;
  createdAt: string;
  image_url?: string;
  barcode_text?: string;
  analysis: string;
  chemicals: string[];
  rating: string;
  source: string;
};

export type ChatEntry = {
  id: string;
  createdAt: string;
  messages: Array<{ role: string; content: string }>;
};

export type Preferences = {
  avoidFoods: string[];
  allergens: string[];
};

export type LocalDb = {
  analyses: AnalysisEntry[];
  chats: ChatEntry[];
  preferences: Preferences;
};

const DB_PATH =
  process.env.MFS_DB_PATH || path.join(process.cwd(), ".localdb.json");

const DEFAULT_DB: LocalDb = {
  analyses: [],
  chats: [],
  preferences: {
    avoidFoods: [],
    allergens: [],
  },
};

export async function readDb(): Promise<LocalDb> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalDb>;
    return {
      analyses: parsed.analyses ?? DEFAULT_DB.analyses,
      chats: parsed.chats ?? DEFAULT_DB.chats,
      preferences: {
        avoidFoods:
          parsed.preferences?.avoidFoods ?? DEFAULT_DB.preferences.avoidFoods,
        allergens:
          parsed.preferences?.allergens ?? DEFAULT_DB.preferences.allergens,
      },
    };
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      await writeDb(DEFAULT_DB);
      return {
        analyses: [...DEFAULT_DB.analyses],
        chats: [...DEFAULT_DB.chats],
        preferences: {
          avoidFoods: [...DEFAULT_DB.preferences.avoidFoods],
          allergens: [...DEFAULT_DB.preferences.allergens],
        },
      };
    }
    throw err;
  }
}

export async function writeDb(db: LocalDb): Promise<void> {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}
