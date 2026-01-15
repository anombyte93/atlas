"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const MAX_FILE_SIZE_MB = 5;
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png"];
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png"];

interface UploadAreaProps {
  onUploadComplete?: (imageUrl: string) => void;
  onReset?: () => void;
}

export default function UploadArea({ onUploadComplete, onReset }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [previewUrl]);

  const isValidFileType = (file: File) => {
    if (ACCEPTED_MIME_TYPES.includes(file.type)) return true;
    const lowerName = file.name.toLowerCase();
    return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  };

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof payload?.error === "string" ? payload.error : "Upload failed.";
      throw new Error(message);
    }

    if (typeof payload?.image_url !== "string") {
      throw new Error("Upload failed.");
    }

    return payload.image_url as string;
  };

  const triggerAnalysis = (imageUrl: string) => {
    onUploadComplete?.(imageUrl);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files[0]) return;

    const file = files[0];
    if (!isValidFileType(file)) {
      setErrorMessage("Only .jpg and .png images are supported.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setErrorMessage(`File is larger than ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    setErrorMessage(null);
    setFileName(file.name);
    setUploadedUrl(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl(nextPreview);

    setIsUploading(true);
    try {
      const remoteUrl = await uploadImage(file);
      setUploadedUrl(remoteUrl);
      // Trigger analysis after successful upload
      triggerAnalysis(remoteUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Upload failed.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handlePick = () => {
    inputRef.current?.click();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const startScanner = async () => {
    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsScanning(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Camera access was denied.",
      );
      setIsScanning(false);
    }
  };

  const stopScanner = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  const statusLabel = isUploading
    ? "Uploading..."
    : fileName
      ? "Ready"
      : "Awaiting upload";

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">Scan Food</CardTitle>
          <Badge variant={isUploading ? "secondary" : "outline"}>
            {statusLabel}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Drop a label or barcode image for instant ingredient analysis.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Upload issue</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div
          className={`flex flex-col gap-4 rounded-xl border border-dashed p-6 transition ${
            isDragging ? "border-primary/70 bg-primary/5" : "border-muted bg-background"
          }`}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Upload food image"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handlePick();
            }
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Drag & drop a food image here
              </p>
              <p className="text-xs text-muted-foreground">
                PNG or JPG up to {MAX_FILE_SIZE_MB}MB.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handlePick}
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : "Upload image"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={isScanning ? stopScanner : startScanner}
              >
                {isScanning ? "Stop scanner" : "Scan barcode"}
              </Button>
            </div>
          </div>
          <Input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(event) => {
              void handleFiles(event.target.files);
            }}
          />
        </div>

        {previewUrl ? (
          <div className="overflow-hidden rounded-xl border">
            <img
              src={previewUrl}
              alt="Preview of uploaded food"
              className="h-56 w-full object-cover"
            />
            <div className="flex items-center justify-between px-4 py-3 text-xs text-muted-foreground">
              <span>{fileName}</span>
              <span>
                {isUploading
                  ? "Uploading..."
                  : uploadedUrl
                    ? "Ready for analysis"
                    : "Upload complete"}
              </span>
            </div>
          </div>
        ) : null}

        {isScanning ? (
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Camera preview
            </p>
            <video
              ref={videoRef}
              className="mt-2 h-48 w-full rounded-lg bg-black object-cover"
              muted
              playsInline
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
