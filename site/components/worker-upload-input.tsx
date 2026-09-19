"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
export function WorkerUploadInput() {
  const [preview, setPreview] = useState<{
    url: string;
    name: string;
    video: boolean;
  } | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  return (
    <div>
      <label>
        <span>Image or video, up to 50 MB</span>
        <input
          accept="image/*,video/*"
          name="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreview(
              file
                ? {
                    url: URL.createObjectURL(file),
                    name: file.name,
                    video: file.type.startsWith("video/"),
                  }
                : null,
            );
          }}
          required
          type="file"
        />
      </label>
      {preview ? (
        <figure>
          {preview.video ? (
            <video
              controls
              src={preview.url}
              style={{ maxWidth: "100%", maxHeight: 240 }}
            />
          ) : (
            <Image
              alt={`Upload preview: ${preview.name}`}
              height={192}
              src={preview.url}
              style={{
                objectFit: "contain",
                maxWidth: "100%",
                height: "auto",
                maxHeight: 240,
              }}
              unoptimized
              width={256}
            />
          )}
          <figcaption>
            {preview.name} · Private until verified and published
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
