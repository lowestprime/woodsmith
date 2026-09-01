"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";
import {
  calculateEstimate,
  defaultVisualizerState,
  normalizeVisualizerState,
  resolveVisualizerTemplate,
  VISUALIZER_LIMITS,
  type VisualizerState
} from "@/lib/estimator";
import { formatLeadTime, formatMoney } from "@/lib/format";

const CommissionScene3D = dynamic(() => import("@/components/commission-scene"), {
  ssr: false,
  loading: () => <div className="visualizer-scene-loading" role="status">Loading interactive 3D preview...</div>
});

type CommissionTypeOption = {
  slug: string;
  label: string;
  description: string;
  materialOptions: string[];
  defaultDimensions: { width: number; depth: number; height: number; unit: "in" };
};

const FALLBACK_COMMISSION_TYPE: CommissionTypeOption = {
  slug: "other-custom-work",
  label: "Other custom work",
  description: "A custom form developed from your dimensions and requirements.",
  materialOptions: ["White Oak", "Walnut", "Cherry", "Maple"],
  defaultDimensions: { width: 48, depth: 20, height: 30, unit: "in" }
};

const materialColors: Record<string, { top: string; left: string; right: string; accent: string }> = {
  "White Oak": { top: "#c9ad7d", left: "#9f8257", right: "#7e6543", accent: "#f2d8ab" },
  Walnut: { top: "#704e39", left: "#5d3f2d", right: "#432d21", accent: "#ba8e68" },
  Cherry: { top: "#a65f45", left: "#844731", right: "#663323", accent: "#deb49c" },
  Maple: { top: "#ddd1b5", left: "#b9ab8c", right: "#9a8a6f", accent: "#fbf2dc" },
  "Phenolic resin top": { top: "#151515", left: "#d4c7a3", right: "#b8a77e", accent: "#f7f2de" },
  "Bird's-eye maple": { top: "#e8dbc0", left: "#cbbd9f", right: "#a9987a", accent: "#fff7e5" },
  "White maple": { top: "#eee5d3", left: "#d5c8af", right: "#b6a78b", accent: "#ffffff" },
  "Stone top": { top: "#a9a9ac", left: "#77777a", right: "#57575a", accent: "#e8e8ec" },
  "Paint-grade hardwood": { top: "#d7d7d7", left: "#b7b7b7", right: "#969696", accent: "#ffffff" },
  default: { top: "#c9ad7d", left: "#9f8257", right: "#7e6543", accent: "#f2d8ab" }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getPalette(material: string) {
  return materialColors[material] ?? materialColors.default;
}

function renderIsometricSvg(state: VisualizerState) {
  const normalized = normalizeVisualizerState(state);
  const width = normalized.width;
  const depth = normalized.depth;
  const height = normalized.height;
  const palette = getPalette(normalized.material);
  const template = resolveVisualizerTemplate(normalized.kind);
  const scale = Math.min(4.2, 220 / Math.max(width, depth));
  const originX = 250;
  const originY = 190;
  const isoX = (value: number) => value * scale * 0.86;
  const isoY = (value: number) => value * scale * 0.5;
  const topThickness = Math.max(8, height * 0.045 * scale);

  const topFrontLeft = [originX - isoX(width / 2), originY - isoY(width / 2)];
  const topFrontRight = [originX + isoX(width / 2), originY - isoY(width / 2)];
  const topBackRight = [topFrontRight[0] + isoX(depth), topFrontRight[1] + isoY(depth)];
  const topBackLeft = [topFrontLeft[0] + isoX(depth), topFrontLeft[1] + isoY(depth)];

  const dropY = height * scale * 0.92;
  const frontDropLeft = [topFrontLeft[0], topFrontLeft[1] + dropY];
  const frontDropRight = [topFrontRight[0], topFrontRight[1] + dropY];
  const sideDropLeft = [topBackLeft[0], topBackLeft[1] + dropY];
  const sideDropRight = [topBackRight[0], topBackRight[1] + dropY];

  const legs = ["table", "bench", "stool", "chair"].includes(template)
    ? [
        { x: topFrontLeft[0] + 18, y: topFrontLeft[1] + 10 },
        { x: topFrontRight[0] - 22, y: topFrontRight[1] + 10 },
        { x: topBackLeft[0] + 18, y: topBackLeft[1] + 10 },
        { x: topBackRight[0] - 22, y: topBackRight[1] + 10 }
      ]
    : [];

  const drawerVisible = normalized.drawers > 0 && template === "table";
  const shelfVisible = normalized.shelves > 0 && !["shelf", "cabinet"].includes(template);
  const rackVisible = template === "shelf";
  const cabinetVisible = template === "cabinet";

  const polygon = (points: number[][]) => points.map((point) => point.map((value) => value.toFixed(1)).join(",")).join(" ");

  const svg = `
  <svg viewBox="0 0 620 470" xmlns="http://www.w3.org/2000/svg" aria-label="Commission preview">
    <defs>
      <linearGradient id="gridFade" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#332a20" stop-opacity="0.65"/>
        <stop offset="100%" stop-color="#090909" stop-opacity="0"/>
      </linearGradient>
      <pattern id="grainDots" width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="5" cy="6" r="0.75" fill="${palette.accent}" opacity="0.3" />
        <circle cx="13" cy="11" r="0.75" fill="${palette.accent}" opacity="0.2" />
      </pattern>
    </defs>
    <rect width="620" height="470" rx="0" fill="url(#gridFade)"/>
    <g opacity="0.18">
      ${Array.from({ length: 11 }, (_, index) => `<line x1="40" y1="${50 + index * 34}" x2="580" y2="${50 + index * 34}" stroke="#b69662" stroke-width="1"/>`).join("")}
    </g>
    <g>
      <polygon points="${polygon([topFrontLeft, topFrontRight, topBackRight, topBackLeft])}" fill="${palette.top}" />
      <polygon points="${polygon([topFrontRight, topBackRight, sideDropRight, frontDropRight])}" fill="${palette.right}" />
      <polygon points="${polygon([topFrontLeft, topBackLeft, sideDropLeft, frontDropLeft])}" fill="${palette.left}" />
      <polygon points="${polygon([[topFrontLeft[0], topFrontLeft[1] + topThickness], [topFrontRight[0], topFrontRight[1] + topThickness], [topBackRight[0], topBackRight[1] + topThickness], [topBackLeft[0], topBackLeft[1] + topThickness]])}" fill="url(#grainDots)" opacity="0.45"/>
      ${cabinetVisible ? `<polygon points="${polygon([frontDropLeft, frontDropRight, sideDropRight, sideDropLeft])}" fill="#241d17" opacity="0.55" />` : ""}
      ${drawerVisible ? `<rect x="${originX - 58}" y="${originY + 28}" width="116" height="36" fill="#251d16" stroke="#f1d5a6" stroke-width="1.5"/><circle cx="${originX}" cy="${originY + 46}" r="4" fill="#f1d5a6"/>` : ""}
      ${shelfVisible ? `<line x1="${originX - 105}" y1="${originY + 74}" x2="${originX + 105}" y2="${originY + 74}" stroke="#f1d5a6" stroke-width="2" opacity="0.5"/>` : ""}
      ${rackVisible ? Array.from({ length: Math.min(8, Math.max(2, normalized.shelves || 3)) }, (_, index) => `<line x1="${originX - 95}" y1="${originY + 10 + index * 18}" x2="${originX + 95}" y2="${originY + 10 + index * 18}" stroke="#f1d5a6" stroke-width="3" opacity="0.65" />`).join("") : ""}
      ${legs.map((leg) => `<rect x="${leg.x.toFixed(1)}" y="${leg.y.toFixed(1)}" width="14" height="${Math.max(52, dropY - 18).toFixed(1)}" fill="${palette.accent}" opacity="0.9"/>`).join("")}
    </g>
    <g stroke="#f1d5a6" stroke-width="2" fill="none">
      <line x1="70" y1="400" x2="210" y2="400"/>
      <line x1="70" y1="392" x2="70" y2="408"/>
      <line x1="210" y1="392" x2="210" y2="408"/>
      <line x1="480" y1="104" x2="480" y2="${(104 + height * scale * 0.92).toFixed(1)}"/>
      <line x1="472" y1="104" x2="488" y2="104"/>
      <line x1="472" y1="${(104 + height * scale * 0.92).toFixed(1)}" x2="488" y2="${(104 + height * scale * 0.92).toFixed(1)}"/>
    </g>
    <text x="70" y="426" fill="#f1d5a6" font-size="16" letter-spacing="2">0   12   24 in scale</text>
    <text x="492" y="${(104 + height * scale * 0.48).toFixed(1)}" fill="#f1d5a6" font-size="16" letter-spacing="2">H ${height}&quot;</text>
    <text x="${originX - 68}" y="${originY - 92}" fill="#f1d5a6" font-size="22">${width}&quot; × ${depth}&quot; × ${height}&quot;</text>
  </svg>`;

  return svg.trim();
}

function downloadSvg(svg: string, kind: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `beaman-woodworks-${kind.replace(/[^a-z0-9-]+/gi, "-")}-scale-drawing.svg`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export function CustomWorkVisualizer3D({ commissionTypes, bandwidthLeadTimeDays, queueCount, initialTypeSlug, initialDimensions, lockType = false }: {
  commissionTypes: CommissionTypeOption[];
  bandwidthLeadTimeDays: number;
  queueCount: number;
  initialTypeSlug?: string;
  initialDimensions?: { width: number; depth: number; height: number };
  lockType?: boolean;
}) {
  const availableTypes = commissionTypes.length > 0
    ? commissionTypes.some((type) => type.slug === FALLBACK_COMMISSION_TYPE.slug) ? commissionTypes : [...commissionTypes, FALLBACK_COMMISSION_TYPE]
    : [FALLBACK_COMMISSION_TYPE];
  const initialType = availableTypes.find((type) => type.slug === initialTypeSlug) ?? availableTypes[0];
  const [selectedSlug, setSelectedSlug] = useState(initialType.slug);
  const selectedType = availableTypes.find((type) => type.slug === selectedSlug) ?? availableTypes[0];
  const [state, setState] = useState<VisualizerState>(() => normalizeVisualizerState({
    ...defaultVisualizerState(initialType.slug),
    width: Number.isFinite(initialDimensions?.width) && Number(initialDimensions?.width) > 0 ? Number(initialDimensions?.width) : initialType.defaultDimensions.width,
    depth: Number.isFinite(initialDimensions?.depth) && Number(initialDimensions?.depth) > 0 ? Number(initialDimensions?.depth) : initialType.defaultDimensions.depth,
    height: Number.isFinite(initialDimensions?.height) && Number(initialDimensions?.height) > 0 ? Number(initialDimensions?.height) : initialType.defaultDimensions.height
  }));
  const [isGenerating, startGeneration] = useTransition();
  const [renderedPreview, setRenderedPreview] = useState<{ url: string; relativePath?: string; message: string } | null>(null);

  const syncedState = useMemo(() => normalizeVisualizerState({
    ...state,
    kind: selectedType.slug
  }), [selectedType.slug, state]);
  const estimate = useMemo(() => calculateEstimate(syncedState, queueCount, bandwidthLeadTimeDays), [bandwidthLeadTimeDays, queueCount, syncedState]);
  const svg = useMemo(() => renderIsometricSvg(syncedState), [syncedState]);
  const submissionOptions = useMemo(() => ({
    schemaVersion: 1,
    category: selectedType.slug,
    material: syncedState.material,
    joinery: syncedState.joinery,
    drawers: syncedState.drawers,
    shelves: syncedState.shelves,
    renderer: "react-three-fiber",
    previewKind: "conceptual-proportional",
    fabricationReady: false
  }), [selectedType.slug, syncedState.drawers, syncedState.joinery, syncedState.material, syncedState.shelves]);

  function update<K extends keyof VisualizerState>(key: K, value: VisualizerState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function updateNumber(key: "width" | "depth" | "height" | "drawers" | "shelves", value: number) {
    setState((current) => normalizeVisualizerState({ ...current, [key]: value }));
  }

  function generatePhotorealisticPreview() {
    setRenderedPreview({ url: "", message: "Generating preview..." });
    startGeneration(async () => {
      const response = await fetch("/api/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceType: selectedType?.label ?? syncedState.kind,
          material: syncedState.material,
          joinery: syncedState.joinery,
          width: syncedState.width,
          depth: syncedState.depth,
          height: syncedState.height,
          drawers: syncedState.drawers,
          shelves: syncedState.shelves,
          notes: syncedState.notes
        })
      }).catch(() => null);

      if (!response || !response.ok) {
        const payload = response ? await response.json().catch(() => ({})) as { error?: string } : {};
        setRenderedPreview({ url: "", message: payload.error || "Photorealistic rendering is not configured for this deployment." });
        return;
      }

      const payload = await response.json() as { mediaUrl?: string; imageUrl?: string; relativePath?: string; model?: string };
      const url = payload.mediaUrl || payload.imageUrl || "";
      setRenderedPreview({
        url,
        relativePath: payload.relativePath,
        message: payload.model ? `Generated with ${payload.model}.` : "Generated preview ready."
      });
    });
  }

  return (
    <section className="custom-visualizer-3d" aria-label="Custom work scale preview">
      <div className="visualizer-panel-heading">
        <div>
          <p className="eyebrow">Conceptual 3D preview</p>
          <h3>Check proportion and dimensions before sending the request</h3>
          <p className="muted-copy">The model is a proportional planning aid, not a fabrication drawing, final design, or quote.</p>
        </div>
        <span>{formatLeadTime(estimate.leadTimeDays)} lead time</span>
      </div>

      <div className="visualizer-3d-grid">
        <div className="visualizer-stage-3d">
          <CommissionScene3D fallbackSvg={svg} state={syncedState} />
        </div>

        <div className="visualizer-controls-3d">
          {lockType ? <label><span>Piece type</span><strong className="visualizer-locked-value">{selectedType.label}</strong><input name="commissionTypeSlug" type="hidden" value={selectedType.slug} /></label> : <label>
            <span>Piece type</span>
            <select
              name="commissionTypeSlug"
              onChange={(event) => {
                const nextType = availableTypes.find((type) => type.slug === event.target.value) ?? availableTypes[0];
                setSelectedSlug(nextType.slug);
                setState((current) => ({
                  ...current,
                  kind: nextType.slug,
                  material: nextType.materialOptions[0] ?? current.material,
                  width: nextType.defaultDimensions.width,
                  depth: nextType.defaultDimensions.depth,
                  height: nextType.defaultDimensions.height,
                  drawers: nextType.slug === "scientists-desk" ? 1 : 0,
                  shelves: nextType.slug === "pantry-cabinets" ? 4 : nextType.slug === "spice-rack" ? 3 : nextType.slug === "pastry-table" ? 1 : 0
                }));
              }}
              value={selectedType?.slug}
            >
              {availableTypes.map((type) => <option key={type.slug} value={type.slug}>{type.label}</option>)}
            </select>
          </label>}
          <p className="visualizer-type-description">{selectedType.description}</p>
          <label>
            <span>Primary material</span>
            <select name="materialPreference" onChange={(event) => update("material", event.target.value)} value={syncedState.material}>
              {(selectedType?.materialOptions ?? [syncedState.material]).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <div className="field-grid three-up compact-grid">
            <label><span>Width (in)</span><input max={VISUALIZER_LIMITS.width.max} min={VISUALIZER_LIMITS.width.min} name="width" onChange={(event) => updateNumber("width", Number(event.target.value))} required step="0.25" type="number" value={syncedState.width} /></label>
            <label><span>Depth (in)</span><input max={VISUALIZER_LIMITS.depth.max} min={VISUALIZER_LIMITS.depth.min} name="depth" onChange={(event) => updateNumber("depth", Number(event.target.value))} required step="0.25" type="number" value={syncedState.depth} /></label>
            <label><span>Height (in)</span><input max={VISUALIZER_LIMITS.height.max} min={VISUALIZER_LIMITS.height.min} name="height" onChange={(event) => updateNumber("height", Number(event.target.value))} required step="0.25" type="number" value={syncedState.height} /></label>
          </div>
          <div className="field-grid two-up compact-grid">
            <label><span>Drawers</span><input max={VISUALIZER_LIMITS.drawers.max} min={VISUALIZER_LIMITS.drawers.min} name="drawers" onChange={(event) => updateNumber("drawers", Number(event.target.value))} step="1" type="number" value={syncedState.drawers} /></label>
            <label><span>Shelves</span><input max={VISUALIZER_LIMITS.shelves.max} min={VISUALIZER_LIMITS.shelves.min} name="shelves" onChange={(event) => updateNumber("shelves", Number(event.target.value))} step="1" type="number" value={syncedState.shelves} /></label>
          </div>
          <label>
            <span>Joinery direction</span>
            <select name="joinery" onChange={(event) => update("joinery", event.target.value)} value={syncedState.joinery}>
              <option value="Mortise and tenon">Mortise and tenon</option>
              <option value="Exposed dovetail">Exposed dovetail</option>
              <option value="Half-lap">Half-lap</option>
              <option value="Pinned frame">Pinned frame</option>
              <option value="Concealed joinery">Concealed joinery</option>
            </select>
          </label>
          <dl className="estimate-list compact-estimate">
            <div><dt>Materials</dt><dd>{formatMoney(estimate.materialCostCents)}</dd></div>
            <div><dt>Labor</dt><dd>{estimate.laborHours} hrs</dd></div>
            <div><dt>Estimated total</dt><dd>{formatMoney(estimate.totalCents)}</dd></div>
          </dl>
          <p className="muted-copy">This planning range uses current material allowances, shop labor, overhead, markup, and the live project queue. William confirms the quote after reviewing the request.</p>
          <button className="button-secondary" onClick={() => downloadSvg(svg, syncedState.kind)} type="button">Download scale drawing</button>
          <div className="ai-render-panel">
            <button className="button-secondary" disabled={isGenerating} onClick={generatePhotorealisticPreview} type="button">
              {isGenerating ? "Generating..." : "Generate photorealistic preview"}
            </button>
            <p className="muted-copy">{renderedPreview?.message ?? "Optional image-model rendering is separate from the deterministic scale model and activates only when configured."}</p>
            {renderedPreview?.url ? <img alt="AI-generated preview for this custom work request" src={renderedPreview.url} /> : null}
          </div>
          <label className="checkbox-row">
            <input checked={syncedState.includeVisualization} name="includeVisualization" onChange={(event) => update("includeVisualization", event.target.checked)} type="checkbox" value="1" />
            <span>Include this preview with the request</span>
          </label>
        </div>
      </div>

      <input name="estimatedTotalCents" type="hidden" value={estimate.totalCents} />
      <input name="leadTimeDays" type="hidden" value={estimate.leadTimeDays} />
      <input name="materials" type="hidden" value={JSON.stringify([syncedState.material, syncedState.joinery])} />
      <input name="dimensionsJson" type="hidden" value={JSON.stringify({ width: syncedState.width, depth: syncedState.depth, height: syncedState.height, unit: "in" })} />
      <input name="visualizerOptions" type="hidden" value={JSON.stringify(submissionOptions)} />
      <input name="visualizationSvg" type="hidden" value={syncedState.includeVisualization ? svg : ""} />
      <input name="aiPreviewPath" type="hidden" value={syncedState.includeVisualization ? renderedPreview?.relativePath ?? "" : ""} />
    </section>
  );
}
