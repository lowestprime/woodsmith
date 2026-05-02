"use client";

import { useEffect, useMemo, useState } from "react";

type EditablePatch = {
  resource: string;
  id?: string;
  field: string;
  index?: number;
  value: string;
};

type EditableSnapshot = EditablePatch & { text: string };

function editableElements(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-inline-edit-resource][data-inline-edit-field]"))
    .filter((element) => {
      if (element.closest("form,button,.section-edit-link,.inline-edit-hint")) return false;
      return Boolean(element.textContent?.trim());
    });
}

function patchFromElement(element: HTMLElement): EditablePatch | null {
  const resource = element.dataset.inlineEditResource;
  const field = element.dataset.inlineEditField;
  const value = element.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
  if (!resource || !field || !value) return null;
  const indexRaw = element.dataset.inlineEditIndex;
  const index = indexRaw == null || indexRaw === "" ? undefined : Number(indexRaw);
  return {
    resource,
    field,
    ...(element.dataset.inlineEditId ? { id: element.dataset.inlineEditId } : {}),
    ...(Number.isInteger(index) && index >= 0 ? { index } : {}),
    value
  };
}

function collectEditableText(root: ParentNode): EditableSnapshot[] {
  return editableElements(root).flatMap((element) => {
    const patch = patchFromElement(element);
    return patch ? [{ ...patch, text: patch.value }] : [];
  });
}

function setEditableState(root: ParentNode, enabled: boolean) {
  editableElements(root).forEach((element) => {
    element.contentEditable = enabled ? "true" : "false";
    element.spellcheck = enabled;
    element.classList.toggle("inline-editable-active", enabled);
    element.dataset.inlineEditOriginal = enabled ? element.textContent?.trim() ?? "" : element.dataset.inlineEditOriginal ?? "";
  });
}

export function InlineEditAssistant() {
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedHref, setAdvancedHref] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editableCount, setEditableCount] = useState(0);
  const [editingSection, setEditingSection] = useState<HTMLElement | null>(null);
  const help = useMemo(() => "Only highlighted mapped fields save permanently. Links, buttons, forms, prices, dates, and generated metrics stay read-only to avoid corrupting structured data.", []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const editLink = target?.closest<HTMLAnchorElement>("a.section-edit-link");
      if (!editLink) return;

      const section = editLink.closest<HTMLElement>("section");
      if (!section) return;

      event.preventDefault();
      document.querySelectorAll<HTMLElement>("section[data-inline-editing='true']").forEach((openSection) => {
        setEditableState(openSection, false);
        delete openSection.dataset.inlineEditing;
      });

      const count = editableElements(section).length;
      setActive(true);
      setEditingSection(section);
      setAdvancedHref(editLink.href);
      setEditableCount(count);
      if (count === 0) {
        setMessage("This section has no safe persistent inline fields yet. Use the full editor for structured fields.");
      } else {
        setMessage(`Inline edit mode enabled for ${count} mapped field${count === 1 ? "" : "s"}. Edit highlighted text, then Save inline edits.`);
      }
      section.dataset.inlineEditing = "true";
      setEditableState(section, true);
      section.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (!active) return null;

  async function copySnapshot() {
    const root = editingSection ?? document.querySelector<HTMLElement>("section[data-inline-editing='true']") ?? document.body;
    const snapshot = collectEditableText(root);
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setMessage(snapshot.length > 0 ? "Mapped inline-edit snapshot copied." : "No mapped inline fields found in this section.");
  }

  async function saveInlineEdits() {
    const root = editingSection ?? document.querySelector<HTMLElement>("section[data-inline-editing='true']");
    if (!root) {
      setMessage("No active inline-edit section was found.");
      return;
    }

    const patches = collectEditableText(root);
    if (patches.length === 0) {
      setMessage("No mapped inline fields found. Open the full editor for this section.");
      return;
    }

    setSaving(true);
    setMessage("Saving mapped inline edits...");
    try {
      const response = await fetch("/api/studio/inline-edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patches })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string; applied?: unknown[] } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message || `Inline save failed with HTTP ${response.status}.`);
        return;
      }
      setMessage(`Saved ${payload.applied?.length ?? patches.length} mapped inline edit${(payload.applied?.length ?? patches.length) === 1 ? "" : "s"}. Refreshing current view...`);
      setEditableState(root, false);
      delete root.dataset.inlineEditing;
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inline save failed.");
    } finally {
      setSaving(false);
    }
  }

  function cancelInlineEditing() {
    const root = editingSection ?? document.querySelector<HTMLElement>("section[data-inline-editing='true']");
    root?.querySelectorAll<HTMLElement>(".inline-editable-active").forEach((element) => {
      if (element.dataset.inlineEditOriginal != null) {
        element.textContent = element.dataset.inlineEditOriginal;
      }
      element.contentEditable = "false";
      element.classList.remove("inline-editable-active");
      delete element.dataset.inlineEditOriginal;
    });
    document.querySelectorAll<HTMLElement>("section[data-inline-editing='true']").forEach((section) => delete section.dataset.inlineEditing);
    setActive(false);
    setEditingSection(null);
  }

  return (
    <div className="inline-edit-hint" role="status">
      <strong>Inline editing</strong>
      <p>{message}</p>
      <p className="muted-copy">{help}</p>
      <div className="hero-actions">
        <button className="button-primary" disabled={saving || editableCount === 0} type="button" onClick={saveInlineEdits}>
          {saving ? "Saving..." : "Save inline edits"}
        </button>
        <button className="button-secondary" type="button" onClick={copySnapshot}>Copy mapped JSON</button>
        {advancedHref ? <a className="button-secondary" href={advancedHref}>Full editor</a> : null}
        <button className="button-secondary" type="button" onClick={cancelInlineEditing}>Cancel</button>
      </div>
    </div>
  );
}
