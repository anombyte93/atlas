import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png"];

const isAllowedFile = (file: File) => {
  if (ALLOWED_MIME_TYPES.has(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
};

const getExtension = (fileName: string) => {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".png")) return "png";
  return "jpg";
};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (!isAllowedFile(file)) {
      return NextResponse.json(
        { error: "Only .jpg and .png images are supported." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File is larger than 5MB." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const fileName = `${crypto.randomUUID()}.${getExtension(file.name)}`;
    const filePath = path.join(uploadsDir, fileName);
    await fs.writeFile(filePath, buffer);

    return NextResponse.json({ image_url: `/uploads/${fileName}` });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to upload image.",
        details: error?.message || "Unknown",
      },
      { status: 500 },
    );
  }
}
