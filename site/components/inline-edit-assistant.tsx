"use client";

import { useEffect, useMemo, useState } from "react";

type InlineMode = "update" | "add" | "cut";
type EditablePatch = { resource: string; id?: string; field: string; index?: number; value: string; mode?: InlineMode };
type EditableSnapshot = EditablePatch & { text: string };

function editableElements(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-inline-edit-resource][data-inline-edit-field]")).filter((element) => {
    if (element.closest("form,button,.section-edit-link,.inline-edit-hint")) return false;
    return Boolean(element.textContent?.trim());
  });
}

function patchFromElement(element: HTMLElement, mode: InlineMode = "update"): EditablePatch | null {
  const resource = element.dataset.inlineEditResource;
  const field = element.dataset.inlineEditField;
  const value = element.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
  if (!resource || !field || (!value && mode !== "cut")) return null;
  const indexRaw = element.dataset.inlineEditIndex;
  const index = indexRaw == null || indexRaw === "" ? undefined : Number(indexRaw);
  return { resource, field, ...(element.dataset.inlineEditId ? { id: element.dataset.inlineEditId } : {}), ...(Number.isInteger(index) && index >= 0 ? { index } : {}), value, ...(mode !== "update" ? { mode } : {}) };
}

function collectEditableText(root: ParentNode): EditableSnapshot[] {
  return editableElements(root).flatMap((element) => {
    const patch = patchFromElement(element);
    return patch ? [{ ...patch, text: patch.value }] : [];
  });
}

function preventAnchorNavigation(event: Event) { event.preventDefault(); }

function setEditableState(root: ParentNode, enabled: boolean) {
  editableElements(root).forEach((element) => {
    element.contentEditable = enabled ? "true" : "false";
    element.spellcheck = enabled;
    element.classList.toggle("inline-editable-active", enabled);
    element.dataset.inlineEditOriginal = enabled ? element.textContent?.trim() ?? "" : element.dataset.inlineEditOriginal ?? "";
    if (element instanceof HTMLAnchorElement) {
      if (enabled) element.addEventListener("click", preventAnchorNavigation, true);
      else element.removeEventListener("click", preventAnchorNavigation, true);
    }
  });
}

export function InlineEditAssistant() {
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedHref, setAdvancedHref] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editableCount, setEditableCount] = useState(0);
  const [editingSection, setEditingSection] = useState<HTMLElement | null>(null);
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const [addValue, setAddValue] = useState("");
  const help = useMemo(() => "Highlighted mapped text, mapped anchors, and mapped list items save permanently. Use Add item or Remove selected for supported arrays.", []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const editLink = target?.closest<HTMLAnchorElement>("a.section-edit-link");
      if (!editLink) return;
      const section = editLink.closest<HTMLElement>("section");
      if (!section) return;
      event.preventDefault();
      document.querySelectorAll<HTMLElement>("section[data-inline-editing='true']").forEach((openSection) => { setEditableState(openSection, false); delete openSection.dataset.inlineEditing; });
      const count = editableElements(section).length;
      setActive(true);
      setEditingSection(section);
      setAdvancedHref(editLink.href);
      setEditableCount(count);
      setSelectedElement(null);
      setMessage(count === 0 ? "This section has no safe persistent inline fields yet. Use the full editor for structured fields." : `Inline edit mode enabled for ${count} mapped field${count === 1 ? "" : "s"}. Edit highlighted text, then Save inline edits.`);
      section.dataset.inlineEditing = "true";
      setEditableState(section, true);
      section.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    function handleSelect(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const element = target?.closest<HTMLElement>(".inline-editable-active");
      if (element) setSelectedElement(element);
    }
    document.addEventListener("click", handleClick);
    document.addEventListener("click", handleSelect);
    return () => { document.removeEventListener("click", handleClick); document.removeEventListener("click", handleSelect); };
  }, []);

  if (!active) return null;

  async function copySnapshot() {
    const root = editingSection ?? document.querySelector<HTMLElement>("section[data-inline-editing='true']") ?? document.body;
    const snapshot = collectEditableText(root);
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setMessage(snapshot.length > 0 ? "Mapped inline-edit snapshot copied." : "No mapped inline fields found in this section.");
  }

  async function sendPatches(patches: EditablePatch[], successMessage: string) {
    if (patches.length === 0) { setMessage("No mapped inline edit patches were generated."); return; }
    setSaving(true);
    setMessage("Saving mapped inline edits...");
    try {
      const response = await fetch("/api/studio/inline-edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patches }) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) { setMessage(payload?.message || `Inline save failed with HTTP ${response.status}.`); return; }
      setMessage(successMessage);
      const root = editingSection ?? document.querySelector<HTMLElement>("section[data-inline-editing='true']");
      if (root) { setEditableState(root, false); delete root.dataset.inlineEditing; }
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inline save failed.");
    } finally { setSaving(false); }
  }

  async function saveInlineEdits() {
    const root = editingSection ?? document.querySelector<HTMLElement>("section[data-inline-editing='true']");
    if (!root) { setMessage("No active inline-edit section was found."); return; }
    const patches = collectEditableText(root);
    await sendPatches(patches, `Saved ${patches.length} mapped inline edit${patches.length === 1 ? "" : "s"}. Refreshing current view...`);
  }

  async function addInlineItem() {
    const patch = selectedElement ? patchFromElement(selectedElement, "add") : null;
    if (!patch) { setMessage("Select a mapped list item first."); return; }
    if (!addValue.trim()) { setMessage("Type the new item before adding it."); return; }
    await sendPatches([{ ...patch, value: addValue.trim(), mode: "add" }], "Added mapped inline item. Refreshing current view...");
  }

  async function removeSelectedItem() {
    const patch = selectedElement ? patchFromElement(selectedElement, "cut") : null;
    if (!patch || patch.index == null) { setMessage("Select a mapped list item with an index before removing it."); return; }
    await sendPatches([{ ...patch, value: "", mode: "cut" }], "Removed mapped inline item. Refreshing current view...");
  }

  function cancelInlineEditing() {
    const root = editingSection ?? document.querySelector<HTMLElement>("section[data-inline-editing='true']");
    root?.querySelectorAll<HTMLElement>(".inline-editable-active").forEach((element) => {
      if (element.dataset.inlineEditOriginal != null) element.textContent = element.dataset.inlineEditOriginal;
      element.contentEditable = "false";
      element.classList.remove("inline-editable-active");
      delete element.dataset.inlineEditOriginal;
      element.removeEventListener("click", preventAnchorNavigation, true);
    });
    document.querySelectorAll<HTMLElement>("section[data-inline-editing='true']").forEach((section) => delete section.dataset.inlineEditing);
    setActive(false); setEditingSection(null); setSelectedElement(null);
  }

  return (
    <div className="inline-edit-hint" role="status">
      <strong>Inline editing</strong>
      <p>{message}</p>
      <p className="muted-copy">{help}</p>
      <label className="inline-add-field"><span>Add item</span><input value={addValue} onChange={(event) => setAddValue(event.target.value)} placeholder="New detail, tag, material, or divider" /></label>
      <div className="hero-actions">
        <button className="button-primary" disabled={saving || editableCount === 0} type="button" onClick={saveInlineEdits}>{saving ? "Saving..." : "Save inline edits"}</button>
        <button className="button-secondary" disabled={saving} type="button" onClick={addInlineItem}>Add item</button>
        <button className="button-secondary" disabled={saving} type="button" onClick={removeSelectedItem}>Remove selected</button>
        <button className="button-secondary" type="button" onClick={copySnapshot}>Copy JSON</button>
        {advancedHref ? <a className="button-secondary" href={advancedHref}>Full editor</a> : null}
        <button className="button-secondary" type="button" onClick={cancelInlineEditing}>Cancel</button>
      </div>
    </div>
  );
}
