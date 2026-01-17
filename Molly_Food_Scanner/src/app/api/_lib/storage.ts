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

export type AgentOutput = {
  id: string;
  agentId: string;
  agentType: string;
  taskDescription: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
};

export type FoodAnalysisResult = {
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
  needs_confirmation?: boolean;
  suggested_name?: string | null;
};

export type ImageEntry = {
  id: string;
  filename: string;
  url: string;
  uploadedAt: string;
  analysisResult: FoodAnalysisResult | null;
};

export type FoodIdentification = {
  id: string;
  image_url: string;
  imageUrl?: string;
  image_path?: string;
  results: Array<{
    id: string;
    name: string;
    description: string;
    confidence: number;
    source_url: string;
  }>;
  selectedIndex: number | null;
  createdAt: string;
  selectedAt?: string | null;
};

export type LocalDb = {
  analyses: AnalysisEntry[];
  chats: ChatEntry[];
  preferences: Preferences;
  agentOutputs: AgentOutput[];
  images: ImageEntry[];
  identifications: FoodIdentification[];
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
  agentOutputs: [],
  images: [],
  identifications: [],
};

export async function readDb(): Promise<LocalDb> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalDb>;

    // Migration: ensure new fields exist
    const needsMigration = !parsed.agentOutputs || !parsed.images || !parsed.identifications;
    if (needsMigration) {
      parsed.agentOutputs = parsed.agentOutputs ?? DEFAULT_DB.agentOutputs;
      parsed.images = parsed.images ?? DEFAULT_DB.images;
      parsed.identifications = parsed.identifications ?? DEFAULT_DB.identifications;
      await writeDb(parsed as LocalDb);
      console.log('Database migrated: added agentOutputs, images, and identifications arrays');
    }

    return {
      analyses: parsed.analyses ?? DEFAULT_DB.analyses,
      chats: parsed.chats ?? DEFAULT_DB.chats,
      preferences: {
        avoidFoods:
          parsed.preferences?.avoidFoods ?? DEFAULT_DB.preferences.avoidFoods,
        allergens:
          parsed.preferences?.allergens ?? DEFAULT_DB.preferences.allergens,
      },
      agentOutputs: parsed.agentOutputs ?? DEFAULT_DB.agentOutputs,
      images: parsed.images ?? DEFAULT_DB.images,
      identifications: parsed.identifications ?? DEFAULT_DB.identifications,
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
        agentOutputs: [...DEFAULT_DB.agentOutputs],
        images: [...DEFAULT_DB.images],
        identifications: [...DEFAULT_DB.identifications],
      };
    }
    throw err;
  }
}

export async function writeDb(db: LocalDb): Promise<void> {
  const tempPath = DB_PATH + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tempPath, DB_PATH);
}
