"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { calculateEstimate, defaultVisualizerState, type VisualizerState } from "@/lib/estimator";
import { formatLeadTime, formatMoney } from "@/lib/format";

type CommissionTypeOption = {
  slug: string;
  label: string;
  description: string;
  materialOptions: string[];
  defaultDimensions: { width: number; depth: number; height: number; unit: "in" };
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

type VisualizerStyle = CSSProperties & Record<"--piece-w" | "--piece-d" | "--piece-h" | "--top-color" | "--front-color" | "--side-color" | "--accent-color", string>;

function dimensionsForStyle(state: VisualizerState) {
  return {
    width: `${clamp(state.width / 6, 4.5, 16)}rem`,
    depth: `${clamp(state.depth / 5.5, 3.2, 11)}rem`,
    height: `${clamp(state.height / 7, 2.6, 13)}rem`
  };
}

function renderIsometricSvg(state: VisualizerState) {
  const width = clamp(state.width, 8, 144);
  const depth = clamp(state.depth, 4, 48);
  const height = clamp(state.height, 6, 96);
  const palette = getPalette(state.material);
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

  const legs = state.kind === "pantry-cabinets"
    ? []
    : [
        { x: topFrontLeft[0] + 18, y: topFrontLeft[1] + 10 },
        { x: topFrontRight[0] - 22, y: topFrontRight[1] + 10 },
        { x: topBackLeft[0] + 18, y: topBackLeft[1] + 10 },
        { x: topBackRight[0] - 22, y: topBackRight[1] + 10 }
      ];

  const drawerVisible = state.drawers > 0 && ["scientists-desk", "end-table", "pastry-table"].includes(state.kind);
  const shelfVisible = state.shelves > 0 && !["spice-rack"].includes(state.kind);
  const rackVisible = state.kind === "spice-rack";
  const cabinetVisible = state.kind === "pantry-cabinets";

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
      ${rackVisible ? Array.from({ length: Math.max(2, state.shelves || 3) }, (_, index) => `<line x1="${originX - 95}" y1="${originY + 10 + index * 18}" x2="${originX + 95}" y2="${originY + 10 + index * 18}" stroke="#f1d5a6" stroke-width="3" opacity="0.65" />`).join("") : ""}
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

export function CustomWorkVisualizer3D({ commissionTypes, bandwidthLeadTimeDays, queueCount }: {
  commissionTypes: CommissionTypeOption[];
  bandwidthLeadTimeDays: number;
  queueCount: number;
}) {
  const [selectedSlug, setSelectedSlug] = useState(commissionTypes[0]?.slug ?? "hallway-bench");
  const selectedType = useMemo(() => commissionTypes.find((type) => type.slug === selectedSlug) ?? commissionTypes[0], [commissionTypes, selectedSlug]);
  const [state, setState] = useState<VisualizerState>(defaultVisualizerState((commissionTypes[0]?.slug as VisualizerState["kind"]) ?? "hallway-bench"));
  const [rotation, setRotation] = useState(32);
  const [isGenerating, startGeneration] = useTransition();
  const [renderedPreview, setRenderedPreview] = useState<{ url: string; relativePath?: string; message: string } | null>(null);

  const syncedState = useMemo(() => ({
    ...state,
    kind: (selectedType?.slug ?? state.kind) as VisualizerState["kind"]
  }), [selectedType, state]);
  const estimate = useMemo(() => calculateEstimate(syncedState, queueCount, bandwidthLeadTimeDays), [bandwidthLeadTimeDays, queueCount, syncedState]);
  const svg = useMemo(() => renderIsometricSvg(syncedState), [syncedState]);
  const palette = getPalette(syncedState.material);
  const sized = dimensionsForStyle(syncedState);
  const modelStyle: VisualizerStyle = {
    "--piece-w": sized.width,
    "--piece-d": sized.depth,
    "--piece-h": sized.height,
    "--top-color": palette.top,
    "--front-color": palette.left,
    "--side-color": palette.right,
    "--accent-color": palette.accent,
    transform: `rotateX(62deg) rotateZ(${rotation}deg)`
  };

  function update<K extends keyof VisualizerState>(key: K, value: VisualizerState[K]) {
    setState((current) => ({ ...current, [key]: value }));
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
          <p className="eyebrow">3D preview</p>
          <h3>Scale the first idea before sending the request</h3>
        </div>
        <span>{formatLeadTime(estimate.leadTimeDays)} lead time</span>
      </div>

      <div className="visualizer-3d-grid">
        <div className="visualizer-stage-3d">
          <div className="visualizer-floor-grid" />
          <div className={`piece-model-3d piece-kind-${syncedState.kind}`} style={modelStyle}>
            <span className="piece-face piece-top" />
            <span className="piece-face piece-front" />
            <span className="piece-face piece-side" />
            <span className="piece-leg leg-front-left" />
            <span className="piece-leg leg-front-right" />
            <span className="piece-leg leg-back-left" />
            <span className="piece-leg leg-back-right" />
            {syncedState.drawers > 0 ? <span className="piece-drawer" /> : null}
            {syncedState.shelves > 0 ? Array.from({ length: Math.min(5, syncedState.shelves) }, (_, index) => <span className="piece-shelf" key={index} style={{ insetBlockStart: `${38 + index * 13}%` }} />) : null}
          </div>
          <div className="visualizer-scale-rule"><span>0</span><span>12</span><span>24 in</span></div>
        </div>

        <div className="visualizer-controls-3d">
          <label>
            <span>Piece type</span>
            <select
              name="commissionTypeSlug"
              onChange={(event) => {
                const nextType = commissionTypes.find((type) => type.slug === event.target.value) ?? commissionTypes[0];
                setSelectedSlug(nextType.slug);
                setState((current) => ({
                  ...current,
                  kind: nextType.slug as VisualizerState["kind"],
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
              {commissionTypes.map((type) => <option key={type.slug} value={type.slug}>{type.label}</option>)}
            </select>
          </label>
          <label>
            <span>Primary material</span>
            <select name="materialPreference" onChange={(event) => update("material", event.target.value)} value={syncedState.material}>
              {(selectedType?.materialOptions ?? [syncedState.material]).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <div className="field-grid three-up compact-grid">
            <label><span>Width</span><input name="width" onChange={(event) => update("width", Number(event.target.value || 0))} type="number" value={syncedState.width} /></label>
            <label><span>Depth</span><input name="depth" onChange={(event) => update("depth", Number(event.target.value || 0))} type="number" value={syncedState.depth} /></label>
            <label><span>Height</span><input name="height" onChange={(event) => update("height", Number(event.target.value || 0))} type="number" value={syncedState.height} /></label>
          </div>
          <div className="field-grid three-up compact-grid">
            <label><span>Drawers</span><input name="drawers" min={0} onChange={(event) => update("drawers", Number(event.target.value || 0))} type="number" value={syncedState.drawers} /></label>
            <label><span>Shelves</span><input name="shelves" min={0} onChange={(event) => update("shelves", Number(event.target.value || 0))} type="number" value={syncedState.shelves} /></label>
            <label><span>Rotate</span><input max={65} min={-65} onChange={(event) => setRotation(Number(event.target.value || 0))} type="range" value={rotation} /></label>
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
          <div className="ai-render-panel">
            <button className="button-secondary" disabled={isGenerating} onClick={generatePhotorealisticPreview} type="button">
              {isGenerating ? "Generating..." : "Generate photorealistic preview"}
            </button>
            <p className="muted-copy">{renderedPreview?.message ?? "Optional AI rendering activates only when the deployment has image-model credentials enabled."}</p>
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
      <input name="visualizerOptions" type="hidden" value={JSON.stringify({ drawers: syncedState.drawers, shelves: syncedState.shelves, rotation, renderer: "procedural-3d-css" })} />
      <input name="visualizationSvg" type="hidden" value={syncedState.includeVisualization ? svg : ""} />
      <input name="aiPreviewPath" type="hidden" value={syncedState.includeVisualization ? renderedPreview?.relativePath ?? "" : ""} />
    </section>
  );
}

export function CommissionVisualizerFields({ commissionTypes, bandwidthLeadTimeDays, bandwidthPercent, queueCount }: {
  commissionTypes: CommissionTypeOption[];
  bandwidthLeadTimeDays: number;
  bandwidthPercent: number;
  queueCount: number;
}) {
  const [selectedSlug, setSelectedSlug] = useState(commissionTypes[0]?.slug ?? "hallway-bench");
  const selectedType = useMemo(() => commissionTypes.find((type) => type.slug === selectedSlug) ?? commissionTypes[0], [commissionTypes, selectedSlug]);
  const [state, setState] = useState<VisualizerState>(defaultVisualizerState((commissionTypes[0]?.slug as VisualizerState["kind"]) ?? "hallway-bench"));

  const syncedState = useMemo(() => ({
    ...state,
    kind: (selectedType?.slug ?? state.kind) as VisualizerState["kind"]
  }), [selectedType, state]);

  const estimate = useMemo(() => calculateEstimate(syncedState, queueCount, bandwidthLeadTimeDays), [bandwidthLeadTimeDays, queueCount, syncedState]);
  const svg = useMemo(() => renderIsometricSvg(syncedState), [syncedState]);

  function update<K extends keyof VisualizerState>(key: K, value: VisualizerState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="visualizer-layout">
      <div className="visualizer-canvas-shell">
        <div className="visualizer-badges">
          <span>Bandwidth {bandwidthPercent}%</span>
          <span>Queue {queueCount} live builds</span>
          <span>Lead time {formatLeadTime(estimate.leadTimeDays)}</span>
        </div>
        <div className="visualizer-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="visualizer-scale-bar">
          <span>To-scale preview</span>
          <span>{selectedType?.label ?? "Custom piece"}</span>
        </div>
      </div>

      <div className="visualizer-sidebar">
        <section className="studio-panel">
          <div className="section-label">Project intent</div>
          <label>
            <span>Commission type</span>
            <select
              name="commissionTypeSlug"
              onChange={(event) => {
                const nextType = commissionTypes.find((type) => type.slug === event.target.value) ?? commissionTypes[0];
                setSelectedSlug(nextType.slug);
                setState((current) => ({
                  ...current,
                  kind: nextType.slug as VisualizerState["kind"],
                  material: nextType.materialOptions[0] ?? current.material,
                  width: nextType.defaultDimensions.width,
                  depth: nextType.defaultDimensions.depth,
                  height: nextType.defaultDimensions.height,
                  drawers: nextType.slug === "scientists-desk" ? 1 : current.drawers,
                  shelves: nextType.slug === "pantry-cabinets" ? 4 : nextType.slug === "spice-rack" ? 3 : current.shelves
                }));
              }}
              value={selectedType?.slug}
            >
              {commissionTypes.map((type) => (
                <option key={type.slug} value={type.slug}>{type.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Project brief</span>
            <textarea name="brief" placeholder="How will the piece be used, where will it live, and what matters most?" rows={5} />
          </label>
        </section>

        <section className="studio-panel">
          <div className="section-label">Materiality</div>
          <label>
            <span>Primary material</span>
            <select name="material" onChange={(event) => update("material", event.target.value)} value={syncedState.material}>
              {(selectedType?.materialOptions ?? [syncedState.material]).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Joinery</span>
            <select name="joinery" onChange={(event) => update("joinery", event.target.value)} value={syncedState.joinery}>
              <option value="Mortise and tenon">Mortise and tenon</option>
              <option value="Exposed dovetail">Exposed dovetail</option>
              <option value="Half-lap">Half-lap</option>
              <option value="Pinned frame">Pinned frame</option>
              <option value="Concealed joinery">Concealed joinery</option>
            </select>
          </label>
        </section>

        <section className="studio-panel">
          <div className="section-label">Dimensions</div>
          <div className="field-grid three-up compact-grid">
            <label>
              <span>Width (in)</span>
              <input name="width" onChange={(event) => update("width", Number(event.target.value || 0))} type="number" value={syncedState.width} />
            </label>
            <label>
              <span>Depth (in)</span>
              <input name="depth" onChange={(event) => update("depth", Number(event.target.value || 0))} type="number" value={syncedState.depth} />
            </label>
            <label>
              <span>Height (in)</span>
              <input name="height" onChange={(event) => update("height", Number(event.target.value || 0))} type="number" value={syncedState.height} />
            </label>
          </div>
          <div className="field-grid two-up compact-grid">
            <label>
              <span>Drawers</span>
              <input name="drawers" onChange={(event) => update("drawers", Number(event.target.value || 0))} type="number" value={syncedState.drawers} />
            </label>
            <label>
              <span>Shelves</span>
              <input name="shelves" onChange={(event) => update("shelves", Number(event.target.value || 0))} type="number" value={syncedState.shelves} />
            </label>
          </div>
        </section>

        <section className="studio-panel estimate-panel">
          <div className="section-label">Live estimate</div>
          <dl className="estimate-list">
            <div><dt>Material</dt><dd>{formatMoney(estimate.materialCostCents)}</dd></div>
            <div><dt>Labor ({estimate.laborHours} hrs)</dt><dd>{formatMoney(estimate.laborCostCents)}</dd></div>
            <div><dt>Overhead</dt><dd>{formatMoney(estimate.overheadCostCents)}</dd></div>
            <div><dt>Markup</dt><dd>{formatMoney(estimate.markupCostCents)}</dd></div>
            <div><dt>Projected total</dt><dd>{formatMoney(estimate.totalCents)}</dd></div>
            <div><dt>Lead time</dt><dd>{formatLeadTime(estimate.leadTimeDays)}</dd></div>
          </dl>
          <label>
            <span>Additional notes</span>
            <textarea name="notes" onChange={(event) => update("notes", event.target.value)} placeholder="Finish preferences, hardware, special requirements..." rows={3} value={syncedState.notes} />
          </label>
          <label className="checkbox-row">
            <input checked={syncedState.includeVisualization} name="includeVisualization" onChange={(event) => update("includeVisualization", event.target.checked)} type="checkbox" value="1" />
            <span>Include this live preview with the submitted brief</span>
          </label>
          <label>
            <span>Reference images or sketches</span>
            <input multiple name="attachments" type="file" />
          </label>
        </section>

        <input name="estimatedTotalCents" type="hidden" value={estimate.totalCents} />
        <input name="leadTimeDays" type="hidden" value={estimate.leadTimeDays} />
        <input name="materials" type="hidden" value={JSON.stringify([syncedState.material, syncedState.joinery])} />
        <input name="dimensionsJson" type="hidden" value={JSON.stringify({ width: syncedState.width, depth: syncedState.depth, height: syncedState.height, unit: "in" })} />
        <input name="visualizerOptions" type="hidden" value={JSON.stringify({ drawers: syncedState.drawers, shelves: syncedState.shelves, notes: syncedState.notes })} />
        <input name="visualizationSvg" type="hidden" value={syncedState.includeVisualization ? svg : ""} />
      </div>
    </div>
  );
}
