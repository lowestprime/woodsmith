"use client";

import { useEffect, useState } from "react";

type EditableSnapshot = Array<{ selector: string; text: string }>;

function editableSelector(element: Element, index: number) {
  const tag = element.tagName.toLowerCase();
  const text = element.textContent?.trim().slice(0, 24).replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "copy";
  return `${tag}-${index}-${text}`;
}

function collectEditableText(root: ParentNode): EditableSnapshot {
  return Array.from(root.querySelectorAll("h1,h2,h3,p,li,dt,dd,span.brand-mark,span.brand-subtitle"))
    .filter((node) => {
      const element = node as HTMLElement;
      if (element.closest("form,nav,button,a,.header-actions,.site-footer,.studio-workspace-nav")) return false;
      return Boolean(element.textContent?.trim());
    })
    .map((node, index) => ({ selector: editableSelector(node, index), text: node.textContent?.trim() ?? "" }));
}

export function InlineEditAssistant() {
  const [active, setActive] = useState(false);
  const [advancedHref, setAdvancedHref] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const editLink = target?.closest<HTMLAnchorElement>("a.section-edit-link");
      if (!editLink) return;

      const section = editLink.closest<HTMLElement>("section");
      if (!section) return;

      event.preventDefault();
      setActive(true);
      setAdvancedHref(editLink.href);
      setMessage("Inline edit mode enabled for this section. Edit visible copy, then copy the draft or open the full editor for structured fields.");
      section.dataset.inlineEditing = "true";
      section.querySelectorAll<HTMLElement>("h1,h2,h3,p,li,dt,dd").forEach((element) => {
        if (element.closest("form,button,a,.section-edit-link")) return;
        if (!element.textContent?.trim()) return;
        element.contentEditable = "true";
        element.spellcheck = true;
        element.classList.add("inline-editable-active");
      });
      section.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (!active) return null;

  return (
    <div className="inline-edit-hint" role="status">
      <strong>Inline editing</strong>
      <p>{message}</p>
      <div className="hero-actions">
        <button
          className="button-secondary"
          type="button"
          onClick={async () => {
            const editingRoot = document.querySelector<HTMLElement>("section[data-inline-editing='true']") ?? document.body;
            const snapshot = collectEditableText(editingRoot);
            await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
            setMessage("Edited copy snapshot copied. Use the full editor to save structured fields permanently.");
          }}
        >
          Copy edited text
        </button>
        {advancedHref ? <a className="button-primary" href={advancedHref}>Full editor</a> : null}
        <button
          className="button-secondary"
          type="button"
          onClick={() => {
            document.querySelectorAll<HTMLElement>(".inline-editable-active").forEach((element) => {
              element.contentEditable = "false";
              element.classList.remove("inline-editable-active");
            });
            document.querySelectorAll<HTMLElement>("section[data-inline-editing='true']").forEach((section) => delete section.dataset.inlineEditing);
            setActive(false);
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
