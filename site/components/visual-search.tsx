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

  const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
  if (saturation < 20 && brightness > 120 && brightness < 200) {
    labels.add("neutral tone");
  }

  if (red > 140 && green > 100 && blue < 90) {
    labels.add("walnut");
    labels.add("warm brown");
  }

  if (brightness > 200 && warmth > 10 && warmth < 40) {
    labels.add("bird's-eye maple");
    labels.add("blonde wood");
  }

  return [...labels];
}

function describeDominantRegions(imageData: ImageData) {
  const { data, width, height } = imageData;
  const regions = { center: { r: 0, g: 0, b: 0, n: 0 }, edge: { r: 0, g: 0, b: 0, n: 0 } };
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const isCenter = Math.sqrt(dx * dx + dy * dy) < radius;
      const target = isCenter ? regions.center : regions.edge;
      target.r += data[i] ?? 0;
      target.g += data[i + 1] ?? 0;
      target.b += data[i + 2] ?? 0;
      target.n += 1;
    }
  }

  const centerLabels = regions.center.n > 0
    ? describeColor(regions.center.r / regions.center.n, regions.center.g / regions.center.n, regions.center.b / regions.center.n)
    : [];

  const edgeLabels = regions.edge.n > 0
    ? describeColor(regions.edge.r / regions.edge.n, regions.edge.g / regions.edge.n, regions.edge.b / regions.edge.n)
    : [];

  const edgeIsBackground = edgeLabels.some((label) => label.includes("neutral") || label.includes("background"));

  return {
    subjectLabels: centerLabels,
    backgroundLabels: edgeLabels,
    subjectIsWood: centerLabels.some((l) => !l.includes("neutral") && !l.includes("background")),
    backgroundIsClean: edgeIsBackground
  };
}

async function analyzeImageAdvanced(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { labels: [] as string[], regions: null };
  }

  context.drawImage(bitmap, 0, 0, size, size);
  const imageData = context.getImageData(0, 0, size, size);
  const regions = describeDominantRegions(imageData);

  const allLabels = [...new Set([...regions.subjectLabels, ...(regions.backgroundIsClean ? [] : regions.backgroundLabels)])];
  bitmap.close();
  return { labels: allLabels, regions };
}

export function VisualSearchAssist({ initialQuery = "", isAdmin = false }: { initialQuery?: string; isAdmin?: boolean }) {
  const [query, setQuery] = useState(initialQuery);
  const [labels, setLabels] = useState<string[]>([]);
  const [analysisNote, setAnalysisNote] = useState("");

  async function analyzeFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setAnalysisNote("Analyzing image...");
    try {
      const { labels: nextLabels, regions } = await analyzeImageAdvanced(file);
      setLabels(nextLabels);

      const contextLabels = [];
      if (regions?.subjectIsWood) {
        contextLabels.push("furniture");
      }
      if (regions?.backgroundIsClean) {
        contextLabels.push("studio-shot");
      }

      const allTerms = [...new Set([...nextLabels, ...contextLabels])].filter(Boolean);
      setQuery((current) => {
        const existing = current.trim();
        const newTerms = allTerms.filter((term) => !existing.toLowerCase().includes(term.toLowerCase()));
        return [existing, ...newTerms].filter(Boolean).join(" ");
      });

      setAnalysisNote(
        regions?.subjectIsWood
          ? `Detected wood tones: ${nextLabels.join(", ")}. ${regions.backgroundIsClean ? "Clean background detected." : "Background detected with mixed tones."}`
          : `Color analysis: ${nextLabels.join(", ")}.`
      );
    } catch {
      setAnalysisNote("Image analysis could not be completed. Try a different image or enter search terms manually.");
    }
  }

  return (
    <div className="visual-search-assist">
      <label>
        <span>Search words</span>
        <input name="q" onChange={(event) => setQuery(event.target.value)} type="search" value={query} />
      </label>
      <label>
        <span>Search by reference image</span>
        <input accept="image/*" onChange={(event) => void analyzeFile(event.currentTarget.files?.[0])} type="file" />
      </label>
      <p className="muted-copy">
        {analysisNote
          ? analysisNote
          : labels.length > 0
            ? `Visual cues detected: ${labels.join(", ")}.`
            : isAdmin
              ? "Upload a reference image to find visually similar media across the library using color, material, and tone analysis."
              : "Upload a reference image to search by visual similarity. The image is analyzed locally for wood species, finish, and material cues."}
      </p>
    </div>
  );
}
