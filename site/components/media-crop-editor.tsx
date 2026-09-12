"use client";

import { useState } from "react";
import { toMediaUrl } from "@/lib/format";
import { MEDIA_CROP_MAX_ZOOM, normalizeMediaCrop } from "@/lib/media-crop";

export function MediaCropEditor({
  relativePath,
  altText,
  focalX,
  focalY,
  zoom,
  cleanupMode,
  cropAspect,
  sourceSignature
}: {
  relativePath: string;
  altText: string;
  focalX: number;
  focalY: number;
  zoom: number;
  cleanupMode: string;
  cropAspect: string;
  sourceSignature?: unknown;
}) {
  const initial = normalizeMediaCrop({ focalX, focalY, zoom, cropAspect });
  const [x, setX] = useState(initial.focalX);
  const [y, setY] = useState(initial.focalY);
  const [scale, setScale] = useState(initial.zoom);
  const [aspect, setAspect] = useState<string>(initial.cropAspect);

  return (
    <div className="media-crop-editor">
      <div className={`media-crop-stage cleanup-${cleanupMode} crop-${aspect}`}>
        <img alt={altText} src={toMediaUrl(relativePath, sourceSignature)} style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${scale})` }} />
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
          <input max={MEDIA_CROP_MAX_ZOOM} min={1} name="zoom" onChange={(event) => setScale(Number(event.target.value))} step={0.05} type="range" value={scale} />
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
