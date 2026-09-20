import { marked } from "marked";
import { sanitizeHtml, toMediaUrl } from "./format.ts";

function escapeText(value: FormDataEntryValue | null) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// Render the same Markdown body as the public route, inside the preview's sandbox.
export function processPreviewDocument(fields: FormData) {
  const title = escapeText(fields.get("title"));
  const excerpt = escapeText(fields.get("excerpt"));
  const body = sanitizeHtml(marked.parse(String(fields.get("body") ?? ""), { async: false }));
  const cover = String(fields.get("coverMediaPath") ?? "");
  const image = cover ? `<img alt="${title}" src="${toMediaUrl(cover)}">` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.65 system-ui,sans-serif;margin:24px;color:#29251f;background:#fffdf8;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap}table{max-width:100%}h1{font-size:1.7rem;line-height:1.2}</style></head><body><h1>${title}</h1><p>${excerpt}</p>${image}<main>${body}</main></body></html>`;
}
