"use client";

import { Component, useEffect, useRef, useState, type ErrorInfo, type KeyboardEvent, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Edges, Grid, Html, OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Vector3 } from "three";
import {
  normalizeVisualizerState,
  resolveVisualizerTemplate,
  type VisualizerState
} from "@/lib/estimator";

type ViewPreset = "isometric" | "front" | "side" | "top";
type CameraCommandKind = "rotate-left" | "rotate-right" | "zoom-in" | "zoom-out" | "reset";
type CameraCommand = { id: number; kind: CameraCommandKind } | null;
type Position = [number, number, number];

const INCH = 0.0254;

const MATERIAL_COLORS: Record<string, string> = {
  "White Oak": "#c9ad7d",
  "Black Walnut": "#5b3c2b",
  Walnut: "#5b3c2b",
  Cherry: "#9d563f",
  Maple: "#ddd1b5",
  "Hard Maple": "#ddd1b5",
  "White maple": "#eee5d3",
  "Bird's-eye maple": "#e8dbc0",
  "Phenolic resin top": "#171717",
  "Stone top": "#929296",
  "Paint-grade hardwood": "#d4d3ce"
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function Part({ color, position, size }: { color: string; position: Position; size: Position }) {
  return (
    <mesh castShadow position={position} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={0.02} roughness={0.62} />
      <Edges color="#3b2d20" threshold={18} />
    </mesh>
  );
}

function FurnitureModel({ state }: { state: VisualizerState }) {
  const normalized = normalizeVisualizerState(state);
  const width = normalized.width * INCH;
  const depth = normalized.depth * INCH;
  const height = normalized.height * INCH;
  const board = clamp(Math.min(width, depth) * 0.075, 0.025, 0.07);
  const rail = clamp(board * 1.35, 0.035, 0.085);
  const leg = clamp(Math.min(width, depth) * 0.09, 0.035, 0.09);
  const color = MATERIAL_COLORS[normalized.material] ?? "#c9ad7d";
  const accent = normalized.material.includes("Phenolic") ? "#d8c9a5" : color;
  const template = resolveVisualizerTemplate(normalized.kind);
  const parts: ReactNode[] = [];
  const add = (key: string, position: Position, size: Position, partColor = color) => parts.push(<Part color={partColor} key={key} position={position} size={size} />);

  if (["table", "bench", "stool"].includes(template)) {
    const topHeight = template === "stool" ? Math.max(board * 1.3, 0.04) : board;
    add("top", [0, height - topHeight / 2, 0], [width, topHeight, depth], normalized.material.includes("Phenolic") || normalized.material.includes("Stone") ? MATERIAL_COLORS[normalized.material] : color);
    const insetX = Math.max(leg, width / 2 - leg * 1.8);
    const insetZ = Math.max(leg, depth / 2 - leg * 1.8);
    [[-insetX, -insetZ], [insetX, -insetZ], [-insetX, insetZ], [insetX, insetZ]].forEach(([x, z], index) => add(`leg-${index}`, [x, (height - topHeight) / 2, z], [leg, height - topHeight, leg], accent));
    if (normalized.shelves > 0) add("lower-shelf", [0, height * 0.28, 0], [width - leg * 2.2, board * 0.72, depth - leg * 1.8], accent);
    for (let index = 0; index < Math.min(4, normalized.drawers); index += 1) {
      const drawerWidth = (width - leg * 3) / Math.max(1, Math.min(4, normalized.drawers));
      add(`drawer-${index}`, [-width / 2 + leg * 1.5 + drawerWidth * (index + 0.5), height - topHeight - rail * 0.7, -depth / 2 + rail * 0.45], [drawerWidth * 0.9, rail, rail * 0.5], accent);
    }
  } else if (template === "cabinet") {
    add("left", [-width / 2 + board / 2, height / 2, 0], [board, height, depth]);
    add("right", [width / 2 - board / 2, height / 2, 0], [board, height, depth]);
    add("top", [0, height - board / 2, 0], [width, board, depth]);
    add("bottom", [0, board / 2, 0], [width, board, depth]);
    add("back", [0, height / 2, depth / 2 - board * 0.25], [width - board * 2, height - board * 2, board * 0.5], accent);
    const shelfCount = Math.max(1, Math.min(8, normalized.shelves));
    for (let index = 1; index <= shelfCount; index += 1) add(`shelf-${index}`, [0, height * index / (shelfCount + 1), 0], [width - board * 2, board * 0.7, depth - board], accent);
    add("door-left", [-width * 0.245, height / 2, -depth / 2 - board * 0.15], [width * 0.48, height - board * 2, board * 0.65], accent);
    add("door-right", [width * 0.245, height / 2, -depth / 2 - board * 0.15], [width * 0.48, height - board * 2, board * 0.65], accent);
  } else if (template === "shelf") {
    add("left", [-width / 2 + board / 2, height / 2, 0], [board, height, depth]);
    add("right", [width / 2 - board / 2, height / 2, 0], [board, height, depth]);
    const shelfCount = Math.max(2, Math.min(8, normalized.shelves || 3));
    for (let index = 0; index < shelfCount; index += 1) add(`shelf-${index}`, [0, board / 2 + (height - board) * index / (shelfCount - 1), 0], [width, board, depth], accent);
  } else if (template === "chair") {
    const seatHeight = height * 0.47;
    add("seat", [0, seatHeight, 0], [width, board * 1.25, depth]);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z], index) => add(`leg-${index}`, [x * (width / 2 - leg), seatHeight / 2, z * (depth / 2 - leg)], [leg, seatHeight, leg], accent));
    add("back-left", [-width / 2 + leg, (height + seatHeight) / 2, depth / 2 - leg], [leg, height - seatHeight, leg], accent);
    add("back-right", [width / 2 - leg, (height + seatHeight) / 2, depth / 2 - leg], [leg, height - seatHeight, leg], accent);
    add("back-rail", [0, height - rail, depth / 2 - leg], [width, rail, board], accent);
  } else if (template === "door") {
    add("door", [0, height / 2, 0], [width, height, board * 1.5]);
    add("top-rail", [0, height - rail * 1.5, -board], [width * 0.84, rail, board * 0.5], accent);
    add("mid-rail", [0, height * 0.48, -board], [width * 0.84, rail, board * 0.5], accent);
  } else if (template === "bed") {
    const frameHeight = Math.min(height * 0.45, 0.55);
    add("left-rail", [-width / 2 + board, frameHeight, 0], [board * 1.4, rail, depth], accent);
    add("right-rail", [width / 2 - board, frameHeight, 0], [board * 1.4, rail, depth], accent);
    add("head", [0, height / 2, depth / 2 - board], [width, height, board * 1.4], color);
    add("foot", [0, frameHeight, -depth / 2 + board], [width, rail * 1.4, board * 1.4], color);
    for (let index = 1; index < 7; index += 1) add(`slat-${index}`, [0, frameHeight, -depth / 2 + depth * index / 7], [width - board * 3, board * 0.55, board], accent);
  } else if (template === "frame") {
    add("top", [0, height - board / 2, 0], [width, board, board]);
    add("bottom", [0, board / 2, 0], [width, board, board]);
    add("left", [-width / 2 + board / 2, height / 2, 0], [board, height, board]);
    add("right", [width / 2 - board / 2, height / 2, 0], [board, height, board]);
  } else if (template === "easel") {
    add("left", [-width * 0.24, height / 2, 0], [leg, height, leg], accent);
    add("right", [width * 0.24, height / 2, 0], [leg, height, leg], accent);
    add("ledge", [0, height * 0.34, -depth * 0.2], [width * 0.82, board, depth * 0.55], color);
    add("canvas", [0, height * 0.63, 0], [width * 0.68, height * 0.48, board * 0.5], "#e7dfcf");
  } else if (template === "board") {
    add("board", [0, Math.max(board, height / 2), 0], [width, Math.max(board, Math.min(height, board * 1.4)), depth], color);
  } else if (template === "clock") {
    add("case", [0, height / 2, 0], [width, height, Math.max(board, depth)], color);
    add("face", [0, height * 0.62, -Math.max(board, depth) / 2 - 0.004], [width * 0.68, height * 0.42, board * 0.24], "#e8dfc9");
  } else {
    add("body", [0, Math.max(board, height / 2), 0], [width, Math.max(board, height), depth], color);
  }

  return <group position={[0, 0, 0]}>{parts}</group>;
}

function CameraRig({ command, preset, size }: { command: CameraCommand; preset: ViewPreset; size: number }) {
  const { camera, invalidate, size: viewportSize } = useThree();
  useEffect(() => {
    const portraitScale = clamp(viewportSize.height / Math.max(1, viewportSize.width), 1, 2.2);
    const distance = Math.max(2.6, size * 2.2 * portraitScale);
    const positions: Record<ViewPreset, Position> = {
      isometric: [distance, distance * 0.78, distance],
      front: [0, distance * 0.38, distance],
      side: [distance, distance * 0.38, 0],
      top: [0.001, distance, 0.001]
    };
    camera.position.set(...positions[preset]);
    if ("isOrthographicCamera" in camera && camera.isOrthographicCamera) {
      camera.zoom = clamp(Math.min(viewportSize.width, viewportSize.height) / (Math.max(size, 0.1) * 1.65), 20, 240);
    }
    camera.lookAt(0, size * 0.3, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, preset, size, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!command) return;
    const target = new Vector3(0, Math.min(size * 0.3, 0.8), 0);
    const offset = camera.position.clone().sub(target);

    if (command.kind === "rotate-left" || command.kind === "rotate-right") {
      offset.applyAxisAngle(new Vector3(0, 1, 0), command.kind === "rotate-left" ? Math.PI / 12 : -Math.PI / 12);
      camera.position.copy(target.clone().add(offset));
    } else if (command.kind === "zoom-in" || command.kind === "zoom-out") {
      if ("isOrthographicCamera" in camera && camera.isOrthographicCamera) {
        camera.zoom = clamp(camera.zoom * (command.kind === "zoom-in" ? 1.16 : 0.86), 0.35, 5);
      } else {
        offset.multiplyScalar(command.kind === "zoom-in" ? 0.84 : 1.16);
        camera.position.copy(target.clone().add(offset));
      }
    } else {
      const portraitScale = clamp(viewportSize.height / Math.max(1, viewportSize.width), 1, 2.2);
      const distance = Math.max(2.6, size * 2.2 * portraitScale);
      camera.position.set(distance, distance * 0.78, distance);
      if ("isOrthographicCamera" in camera && camera.isOrthographicCamera) {
        camera.zoom = clamp(Math.min(viewportSize.width, viewportSize.height) / (Math.max(size, 0.1) * 1.65), 20, 240);
      }
    }

    camera.lookAt(target);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, command, invalidate, size, viewportSize.height, viewportSize.width]);
  return null;
}

function Dimensions({ state }: { state: VisualizerState }) {
  const normalized = normalizeVisualizerState(state);
  const depth = normalized.depth * INCH;
  const height = normalized.height * INCH;
  return <group><Html center position={[0, height + 0.16, 0]}><span className="scene-dimension-label">{normalized.width}&quot; W x {normalized.depth}&quot; D x {normalized.height}&quot; H</span></Html><Html center position={[0, 0.02, depth / 2 + 0.22]}><span className="scene-dimension-label">12 in grid</span></Html></group>;
}

class SceneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Commission 3D preview failed", error, info.componentStack); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function supportsWebGl() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function CommissionScene3D({ state, fallbackSvg }: { state: VisualizerState; fallbackSvg: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [reducedMotionOverride, setReducedMotionOverride] = useState(false);
  const [preset, setPreset] = useState<ViewPreset>("isometric");
  const [orthographic, setOrthographic] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>(null);
  const [exportStatus, setExportStatus] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const normalizedState = normalizeVisualizerState(state);
  const size = Math.max(normalizedState.width, normalizedState.depth, normalizedState.height) * INCH;

  useEffect(() => {
    setAvailable(supportsWebGl());
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setPrefersReducedMotion(media.matches);
    updateMotionPreference();
    media.addEventListener("change", updateMotionPreference);
    return () => media.removeEventListener("change", updateMotionPreference);
  }, []);

  const fallback = <div className="visualizer-static-fallback"><div dangerouslySetInnerHTML={{ __html: fallbackSvg }} /><p>Interactive 3D is unavailable in this browser. The deterministic proportional drawing remains part of the request.</p></div>;
  if (available === false) return fallback;
  if (available == null) return <div className="visualizer-scene-loading" role="status">Preparing interactive preview...</div>;
  if (prefersReducedMotion && !reducedMotionOverride) {
    return <div className="visualizer-static-fallback"><div dangerouslySetInnerHTML={{ __html: fallbackSvg }} /><p>Your reduced-motion preference is active, so the deterministic scale drawing is shown by default.</p><button className="button-secondary" onClick={() => setReducedMotionOverride(true)} type="button">Enable interactive 3D</button></div>;
  }

  function issueCameraCommand(kind: CameraCommandKind) {
    if (kind === "reset") setPreset("isometric");
    setCameraCommand((current) => ({ id: (current?.id ?? 0) + 1, kind }));
  }

  function exportSnapshot() {
    const canvas = canvasRef.current;
    if (!canvas) {
      setExportStatus("The interactive preview is not ready to export.");
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        setExportStatus("The browser could not create a preview image.");
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `beaman-woodworks-${normalizedState.kind.replace(/[^a-z0-9-]+/gi, "-")}-concept.png`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setExportStatus("PNG preview exported.");
    }, "image/png");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const commandByKey: Record<string, CameraCommandKind | undefined> = {
      ArrowLeft: "rotate-left",
      ArrowRight: "rotate-right",
      "+": "zoom-in",
      "=": "zoom-in",
      "-": "zoom-out",
      Home: "reset"
    };
    const command = commandByKey[event.key];
    if (!command) return;
    event.preventDefault();
    issueCameraCommand(command);
  }

  return (
    <SceneErrorBoundary fallback={fallback}>
      <div aria-describedby="commission-scene-help commission-scene-equivalent" aria-label="Interactive conceptual furniture preview" className="commission-scene-shell" onKeyDown={handleKeyDown} role="region" tabIndex={0}>
        <div className="commission-scene-toolbar" aria-label="3D view controls">
          {(["isometric", "front", "side", "top"] as ViewPreset[]).map((view) => <button aria-pressed={preset === view} className={preset === view ? "is-active" : ""} key={view} onClick={() => setPreset(view)} type="button">{view}</button>)}
          <button aria-pressed={orthographic} onClick={() => setOrthographic((value) => !value)} type="button">{orthographic ? "Perspective" : "Orthographic"}</button>
          <button aria-pressed={showDimensions} onClick={() => setShowDimensions((value) => !value)} type="button">Dimensions</button>
          <button aria-label="Rotate preview left" onClick={() => issueCameraCommand("rotate-left")} type="button">Rotate left</button>
          <button aria-label="Rotate preview right" onClick={() => issueCameraCommand("rotate-right")} type="button">Rotate right</button>
          <button aria-label="Zoom preview in" onClick={() => issueCameraCommand("zoom-in")} type="button">Zoom +</button>
          <button aria-label="Zoom preview out" onClick={() => issueCameraCommand("zoom-out")} type="button">Zoom -</button>
          <button onClick={() => issueCameraCommand("reset")} type="button">Reset view</button>
          <button onClick={exportSnapshot} type="button">Export PNG</button>
        </div>
        <div className="commission-scene-canvas">
        <Canvas dpr={[1, 1.5]} fallback={fallback} frameloop="demand" gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" }} onCreated={({ gl }) => { canvasRef.current = gl.domElement; }} shadows="basic">
          <color attach="background" args={["#0d0c0a"]} />
          <PerspectiveCamera far={100} fov={38} makeDefault={!orthographic} near={0.01} position={[3, 2.2, 3]} />
          <OrthographicCamera far={100} makeDefault={orthographic} near={0.01} position={[3, 2.2, 3]} zoom={100} />
          <ambientLight intensity={0.72} />
          <hemisphereLight color="#fff2d6" groundColor="#1b1711" intensity={1.15} />
          <directionalLight castShadow intensity={2.6} position={[3.5, 5, 2.5]} shadow-mapSize-height={512} shadow-mapSize-width={512} />
          <group position={[0, -Math.min(normalizedState.height * INCH * 0.18, 0.28), 0]}><FurnitureModel state={normalizedState} />{showDimensions ? <Dimensions state={normalizedState} /> : null}</group>
          <Grid args={[12, 12]} cellColor="#5f513d" cellSize={INCH * 12} cellThickness={0.6} fadeDistance={10} fadeStrength={1.5} infiniteGrid position={[0, -0.01, 0]} sectionColor="#a98a58" sectionSize={INCH * 48} />
          <ContactShadows blur={2.4} far={8} opacity={0.52} position={[0, -0.005, 0]} resolution={512} scale={8} />
          <CameraRig command={cameraCommand} preset={preset} size={size} />
          <OrbitControls enableDamping={false} makeDefault maxDistance={Math.max(4, size * 5)} minDistance={Math.max(1, size * 0.8)} target={[0, Math.min(normalizedState.height * INCH * 0.4, 0.8), 0]} />
        </Canvas>
        </div>
        <p className="commission-scene-help" id="commission-scene-help">Drag or use touch to orbit. Use the wheel, pinch gesture, toolbar, or keyboard + / - to zoom; arrow keys rotate; Home resets the view.</p>
        <p className="commission-scene-equivalent" id="commission-scene-equivalent">Conceptual proportional preview: {normalizedState.width} by {normalizedState.depth} by {normalizedState.height} inches; {normalizedState.material}; {normalizedState.drawers} drawer{normalizedState.drawers === 1 ? "" : "s"}; {normalizedState.shelves} shelf/shelves. This preview is not a fabrication drawing or final quote.</p>
        <p aria-live="polite" className="commission-scene-export-status">{exportStatus}</p>
      </div>
    </SceneErrorBoundary>
  );
}
