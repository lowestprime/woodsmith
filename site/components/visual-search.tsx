"use client";

import { useState } from "react";

function describeColor(red: number, green: number, blue: number) {
  const brightness = (red + green + blue) / 3;
  const warmth = red - blue;
  const labels = new Set<string>();

  if (brightness < 75) {
    labels.add("ebony");
    labels.add("dark finish");
  } else if (brightness > 185) {
    labels.add("white maple");
    labels.add("light maple");
  }

  if (warmth > 32) {
    labels.add("warm wood");
    labels.add("cherry");
  }

  if (green > red * 0.88 && red > blue * 1.08) {
    labels.add("oak");
    labels.add("maple");
  }

  if (Math.abs(red - green) < 18 && Math.abs(green - blue) < 18) {
    labels.add("neutral background");
  }

  return [...labels];
}

async function averageImageColor(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return [];
  }

  context.drawImage(bitmap, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    red += pixels[index] ?? 0;
    green += pixels[index + 1] ?? 0;
    blue += pixels[index + 2] ?? 0;
    count += 1;
  }

  bitmap.close();
  return describeColor(red / count, green / count, blue / count);
}

export function VisualSearchAssist({ initialQuery = "", isAdmin = false }: { initialQuery?: string; isAdmin?: boolean }) {
  const [query, setQuery] = useState(initialQuery);
  const [labels, setLabels] = useState<string[]>([]);

  async function analyzeFile(file: File | undefined) {
    if (!file) {
      return;
    }

    const nextLabels = await averageImageColor(file);
    setLabels(nextLabels);
    setQuery((current) => [...new Set([current, ...nextLabels, isAdmin ? "media" : "portfolio"].filter(Boolean))].join(" "));
  }

  return (
    <div className="visual-search-assist">
      <label>
        <span>Search words</span>
        <input name="q" onChange={(event) => setQuery(event.target.value)} type="search" value={query} />
      </label>
      <label>
        <span>Optional reference image</span>
        <input accept="image/*" onChange={(event) => void analyzeFile(event.currentTarget.files?.[0])} type="file" />
      </label>
      <p className="muted-copy">
        {labels.length > 0
          ? `Visual hint added: ${labels.join(", ")}.`
          : "The reference image is analyzed in your browser for color and material cues, then translated into searchable tags."}
      </p>
    </div>
  );
}
