import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import {
  detectImageFormat,
  getExtension,
  isAllowedFile,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/image-utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (!isAllowedFile(file)) {
      return NextResponse.json(
        { error: "Only .jpg, .png, and .webp images are supported." },
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

    // Validate image content using magic bytes
    const detectedFormat = detectImageFormat(buffer);
    if (!detectedFormat) {
      return NextResponse.json(
        { error: "Invalid image file. File may be corrupted or not a valid image format." },
        { status: 400 }
      );
    }

    // Strict validation: Ensure detected format matches file extension
    const declaredExt = file.name.toLowerCase().split('.').pop();
    let isMatch = false;

    if (detectedFormat === 'jpg' && (declaredExt === 'jpg' || declaredExt === 'jpeg')) {
      isMatch = true;
    } else if (detectedFormat === 'png' && declaredExt === 'png') {
      isMatch = true;
    } else if (detectedFormat === 'webp' && declaredExt === 'webp') {
      isMatch = true;
    }

    if (!isMatch) {
      return NextResponse.json(
        { 
          error: `File content detected as ${detectedFormat?.toUpperCase()} but extension is .${declaredExt}. Please rename the file to end in .${detectedFormat}.` 
        },
        { status: 400 }
      );
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const fileName = `${crypto.randomUUID()}.${getExtension(file.name)}`;
    const filePath = path.join(uploadsDir, fileName);
    await fs.writeFile(filePath, buffer);

    return NextResponse.json({ image_url: `/uploads/${fileName}` });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('Operation failed:', errorMessage, stack || '');
    return NextResponse.json(
      {
        error: "Operation failed",
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}