"use client";

import { useState } from "react";
import { toMediaUrl } from "@/lib/format";

export function MediaCropEditor({
  relativePath,
  altText,
  focalX,
  focalY,
  zoom,
  cleanupMode,
  cropAspect
}: {
  relativePath: string;
  altText: string;
  focalX: number;
  focalY: number;
  zoom: number;
  cleanupMode: string;
  cropAspect: string;
}) {
  const [x, setX] = useState(focalX);
  const [y, setY] = useState(focalY);
  const [scale, setScale] = useState(zoom);
  const [aspect, setAspect] = useState(cropAspect || "free");

  return (
    <div className="media-crop-editor">
      <div className={`media-crop-stage cleanup-${cleanupMode} crop-${aspect}`}>
        <img alt={altText} src={toMediaUrl(relativePath)} style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${scale})` }} />
        <span className="crop-reticle" aria-hidden="true" />
      </div>
      <div className="field-grid three-up compact-grid">
        <label>
          <span>Focal X</span>
          <input max={100} min={0} name="focalX" onChange={(event) => setX(Number(event.target.value))} type="range" value={x} />
        </label>
        <label>
          <span>Focal Y</span>
          <input max={100} min={0} name="focalY" onChange={(event) => setY(Number(event.target.value))} type="range" value={y} />
        </label>
        <label>
          <span>Zoom</span>
          <input max={3} min={1} name="zoom" onChange={(event) => setScale(Number(event.target.value))} step={0.05} type="range" value={scale} />
        </label>
      </div>
      <label>
        <span>Crop frame</span>
        <select name="cropAspect" onChange={(event) => setAspect(event.target.value)} value={aspect}>
          <option value="free">Free frame</option>
          <option value="square">Square product card</option>
          <option value="portrait">Portrait detail</option>
          <option value="wide">Wide process image</option>
        </select>
      </label>
    </div>
  );
}
