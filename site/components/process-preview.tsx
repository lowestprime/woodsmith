"use client";
import { useState } from "react";
import { processPreviewDocument } from "@/lib/process-preview";

export function ProcessPreview() {
  const [document, setDocument] = useState<string | null>(null);
  return <div data-studio-autosave="ignore">
    <button className="button-secondary" type="button" onClick={(event) => {
      const form = event.currentTarget.closest("form");
      if (form) setDocument(processPreviewDocument(new FormData(form)));
    }}>{document ? "Refresh preview" : "Preview before publishing"}</button>
    {document ? <section aria-label="Private Process preview">
      <p className="muted-copy">Preview of the current fields. Publication is unchanged.</p>
      <iframe sandbox="allow-same-origin" srcDoc={document} title="Process note preview" style={{width:"100%",minHeight:"28rem",border:"1px solid currentColor",borderRadius:"0.75rem"}} />
      <button className="button-secondary" type="button" onClick={() => setDocument(null)}>Close preview</button>
    </section> : null}
  </div>;
}
