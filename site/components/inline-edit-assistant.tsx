"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type InlineMode = "update" | "add" | "cut" | "move";
type EditablePatch = { resource: string; id?: string; field: string; index?: number; toIndex?: number; value?: unknown; expectedValue?: string; mode?: InlineMode };
type EditableSnapshot = EditablePatch & { text: string };
type UrlDraft = { resource: string; id?: string; field: string; index?: number; value: string };

function editableElements(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-inline-edit-resource][data-inline-edit-field]")).filter((element) => {
    if (element.closest("form,button,.section-edit-link,.inline-edit-hint,.inline-url-dialog")) return false;
    return Boolean(element.textContent?.trim());
  });
}

function getInlineIndex(element: HTMLElement) {
  const indexRaw = element.dataset.inlineEditIndex;
  if (indexRaw == null || indexRaw === "") return undefined;
  const parsed = Number(indexRaw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function patchFromElement(element: HTMLElement, mode: InlineMode = "update"): EditablePatch | null {
  const resource = element.dataset.inlineEditResource;
  const field = element.dataset.inlineEditField;
  const value = element.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
  if (!resource || !field || (!value && mode !== "cut")) return null;
  const index = getInlineIndex(element);
  return {
    resource,
    field,
    ...(element.dataset.inlineEditId ? { id: element.dataset.inlineEditId } : {}),
    ...(index !== undefined ? { index } : {}),
    value,
    ...(mode !== "add" ? { expectedValue: element.dataset.inlineEditOriginal ?? value } : {}),
    ...(mode !== "update" ? { mode } : {})
  };
}

function collectEditableText(root: ParentNode): EditableSnapshot[] {
  return editableElements(root).flatMap((element) => {
    const patch = patchFromElement(element);
    return patch ? [{ ...patch, text: String(patch.value ?? "") }] : [];
  });
}

function collectChangedText(root: ParentNode): EditableSnapshot[] {
  return collectEditableText(root).filter((patch) => {
    const element = editableElements(root).find((candidate) => {
      const candidatePatch = patchFromElement(candidate);
      return candidatePatch?.resource === patch.resource && candidatePatch?.field === patch.field && candidatePatch?.id === patch.id && candidatePatch?.index === patch.index;
    });
    return element?.dataset.inlineEditOriginal !== patch.value;
  });
}

function preventAnchorNavigation(event: Event) { event.preventDefault(); }

function clearSelected(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".inline-editable-active-selected").forEach((element) => element.classList.remove("inline-editable-active-selected"));
}

function setEditableState(root: ParentNode, enabled: boolean) {
  editableElements(root).forEach((element) => {
    element.contentEditable = enabled ? "true" : "false";
    element.spellcheck = enabled;
    element.classList.toggle("inline-editable-active", enabled);
    element.classList.remove("inline-editable-active-selected");
    if (enabled) element.dataset.inlineEditOriginal = element.textContent?.trim() ?? "";
    else delete element.dataset.inlineEditOriginal;
    if (element instanceof HTMLAnchorElement) {
      if (enabled) element.addEventListener("click", preventAnchorNavigation, true);
      else element.removeEventListener("click", preventAnchorNavigation, true);
    }
  });
}

function validateUrl(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return { ok: true as const, value: trimmed };
  if (trimmed.startsWith("mailto:") && trimmed.includes("@")) return { ok: true as const, value: trimmed };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return { ok: true as const, value: parsed.toString() };
    return { ok: false as const, message: "Use http, https, mailto, or a root-relative /path." };
  } catch {
    return { ok: false as const, message: "Enter a valid http, https, mailto, or root-relative /path URL." };
  }
}

export function InlineEditAssistant() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedHref, setAdvancedHref] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editableCount, setEditableCount] = useState(0);
  const [editingSection, setEditingSection] = useState<HTMLElement | null>(null);
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const [addValue, setAddValue] = useState("");
  const [urlDraft, setUrlDraft] = useState<UrlDraft | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [lastRevertPatches, setLastRevertPatches] = useState<EditablePatch[]>([]);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const urlDialogRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const urlReturnFocusRef = useRef<HTMLElement | null>(null);
  const urlDialogOpen = Boolean(urlDraft);
  const help = useMemo(() => "Select highlighted text or a mapped link. Use Ctrl+S to save and Esc to exit. Structural fields open in the visual full editor.", []);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>("section[data-inline-editing='true']").forEach((section) => {
      setEditableState(section, false);
      delete section.dataset.inlineEditing;
    });
    setActive(false);
    setEditingSection(null);
    setSelectedElement(null);
    setUrlDraft(null);
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const editLink = target?.closest<HTMLAnchorElement>("a.section-edit-link");
      if (!editLink) return;
      const section = editLink.closest<HTMLElement>("section");
      if (!section) return;
      const count = editableElements(section).length;
      if (count === 0) return;
      event.preventDefault();
      document.querySelectorAll<HTMLElement>("section[data-inline-editing='true']").forEach((openSection) => { setEditableState(openSection, false); delete openSection.dataset.inlineEditing; });
      clearSelected();
      setActive(true);
      setEditingSection(section);
      setAdvancedHref(editLink.href);
      setEditableCount(count);
      setSelectedElement(null);
      setMessage(`Inline edit mode enabled for ${count} mapped field${count === 1 ? "" : "s"}. Select highlighted text or a mapped link before URL edits.`);
      focusReturnRef.current = editLink;
      section.dataset.inlineEditing = "true";
      setEditableState(section, true);
      section.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    function handleSelect(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const element = target?.closest<HTMLElement>(".inline-editable-active");
      if (!element) return;
      clearSelected(editingSection ?? document);
      element.classList.add("inline-editable-active-selected");
      setSelectedElement(element);
      if (element instanceof HTMLAnchorElement && element.dataset.inlineEditUrlField) setMessage("Mapped link selected. Edit its visible text directly, or use Edit URL for its destination.");
      else setMessage(element.dataset.inlineEditIndex ? "Mapped list item selected. Edit text, add a new item, or remove the selected item." : "Mapped text selected. Edit directly, then save inline edits.");
    }
    document.addEventListener("click", handleClick, true);
    document.addEventListener("click", handleSelect);
    return () => { document.removeEventListener("click", handleClick, true); document.removeEventListener("click", handleSelect); };
  }, [editingSection]);

  const handleKeyboard = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (!active || urlDraft) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEditing();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveInlineEdits();
    }
  });

  useEffect(() => {
    if (!active) return;
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [active]);

  useEffect(() => {
    if (!urlDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => urlInputRef.current?.focus());
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setUrlDraft(null);
        return;
      }
      if (event.key !== "Tab" || !urlDialogRef.current) return;
      const focusable = [...urlDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      const target = urlReturnFocusRef.current;
      window.requestAnimationFrame(() => {
        if (target?.isConnected) target.focus();
      });
    };
  }, [urlDialogOpen]);

  if (!active) return null;

  function restoreOriginalText(close = false) {
    const root = editingSection ?? document.querySelector<HTMLElement>("section[data-inline-editing='true']");
    root?.querySelectorAll<HTMLElement>(".inline-editable-active").forEach((element) => {
      if (element.dataset.inlineEditOriginal != null) element.textContent = element.dataset.inlineEditOriginal;
      if (close) {
        element.contentEditable = "false";
        element.classList.remove("inline-editable-active", "inline-editable-active-selected");
        delete element.dataset.inlineEditOriginal;
        element.removeEventListener("click", preventAnchorNavigation, true);
      }
    });
    return root;
  }

  async function sendPatches(patches: EditablePatch[], successMessage: string, options: { reload?: boolean; rollbackOnFailure?: boolean } = {}) {
    if (patches.length === 0) { setMessage("No changes to save."); return false; }
    setSaving(true);
    setMessage("Saving mapped inline edits...");
    try {
      const response = await fetch("/api/studio/inline-edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patches }) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string; details?: Array<{ message?: string }>; revertPatches?: EditablePatch[] } | null;
      if (!response.ok || !payload?.ok) {
        if (options.rollbackOnFailure) restoreOriginalText();
        const detail = Array.isArray(payload?.details) ? payload.details.map((entry) => entry.message).filter(Boolean).join(" ") : "";
        setMessage(`${payload?.message || `Inline save failed with HTTP ${response.status}.`}${detail ? ` ${detail}` : ""}${options.rollbackOnFailure ? " Unsaved text was restored." : ""}`);
        return false;
      }
      setMessage(successMessage);
      setLastRevertPatches(payload.revertPatches ?? []);
      const root = editingSection ?? document.querySelector<HTMLElement>("section[data-inline-editing='true']");
      if (root) { setEditableState(root, false); delete root.dataset.inlineEditing; }
      if (options.reload) window.setTimeout(() => window.location.reload(), 350);
      else {
        if (root) {
          root.dataset.inlineEditing = "true";
          setEditableState(root, true);
        }
        setSelectedElement(null);
        window.setTimeout(() => root?.querySelector<HTMLElement>(".inline-editable-active")?.focus(), 0);
      }
      return true;
    } catch (error) {
      if (options.rollbackOnFailure) restoreOriginalText();
      setMessage(error instanceof Error ? error.message : "Inline save failed.");
      return false;
    } finally { setSaving(false); }
  }

  async function saveInlineEdits() {
    const root = editingSection ?? document.querySelector<HTMLElement>("section[data-inline-editing='true']");
    if (!root) { setMessage("No active inline-edit section was found."); return; }
    const patches = collectChangedText(root);
    await sendPatches(patches, `Saved ${patches.length} inline edit${patches.length === 1 ? "" : "s"}.`, { rollbackOnFailure: true });
  }

  async function addInlineItem() {
    const patch = selectedElement ? patchFromElement(selectedElement, "add") : null;
    if (!patch) { setMessage("Select a mapped list item first."); return; }
    if (!addValue.trim()) { setMessage("Type the new item before adding it."); return; }
    await sendPatches([{ ...patch, value: addValue.trim(), mode: "add" }], "Added mapped inline item. Refreshing current view...", { reload: true });
  }

  async function removeSelectedItem() {
    const patch = selectedElement ? patchFromElement(selectedElement, "cut") : null;
    if (!patch || patch.index == null) { setMessage("Select a mapped list item with an index before removing it."); return; }
    await sendPatches([{ ...patch, value: "", mode: "cut" }], "Removed mapped inline item. Refreshing current view...", { reload: true });
  }

  function openUrlEditor() {
    const element = selectedElement;
    if (!(element instanceof HTMLAnchorElement)) { setMessage("Select a mapped anchor before editing its URL."); return; }
    const field = element.dataset.inlineEditUrlField;
    if (!field) { setMessage("This anchor has editable text only; its URL is not mapped for inline URL editing."); return; }
    const resource = element.dataset.inlineEditResource;
    if (!resource) { setMessage("Selected anchor is missing inline resource metadata."); return; }
    const index = getInlineIndex(element);
    urlReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setUrlDraft({ resource, field, ...(element.dataset.inlineEditId ? { id: element.dataset.inlineEditId } : {}), ...(index !== undefined ? { index } : {}), value: element.getAttribute("href") ?? "" });
    setUrlError(null);
  }

  async function saveUrlEditor() {
    if (!urlDraft) return;
    const validation = validateUrl(urlDraft.value);
    if (!validation.ok) { setUrlError(validation.message); return; }
    const element = selectedElement;
    const saved = await sendPatches([{ resource: urlDraft.resource, field: urlDraft.field, ...(urlDraft.id ? { id: urlDraft.id } : {}), ...(urlDraft.index != null ? { index: urlDraft.index } : {}), value: validation.value, expectedValue: element instanceof HTMLAnchorElement ? element.getAttribute("href") ?? "" : "" }], "Saved mapped URL.");
    if (saved) {
      if (element instanceof HTMLAnchorElement) element.href = validation.value;
      setUrlDraft(null);
    }
  }

  function resetInlineChanges() {
    restoreOriginalText();
    setMessage("Unsaved text was reset to the value shown when edit mode opened.");
  }

  async function undoLastSave() {
    if (lastRevertPatches.length === 0) { setMessage("There is no inline save to undo in this session."); return; }
    const reverted = await sendPatches(lastRevertPatches, "Reverted the last inline save. Refreshing current view...", { reload: true });
    if (reverted) setLastRevertPatches([]);
  }

  function cancelInlineEditing() {
    restoreOriginalText(true);
    document.querySelectorAll<HTMLElement>("section[data-inline-editing='true']").forEach((section) => delete section.dataset.inlineEditing);
    setActive(false); setEditingSection(null); setSelectedElement(null); setUrlDraft(null);
    window.setTimeout(() => focusReturnRef.current?.focus(), 0);
  }

  return (
    <>
      <div className="inline-edit-hint">
        <strong>Inline editing</strong><p aria-live="polite">{message}</p><p className="muted-copy">{help}</p>
        <label className="inline-add-field"><span>Add item</span><input value={addValue} onChange={(event) => setAddValue(event.target.value)} placeholder="New detail, tag, material, or divider" /></label>
        <div className="hero-actions">
          <button className="button-primary" disabled={saving || editableCount === 0} type="button" onClick={saveInlineEdits}>{saving ? "Saving..." : "Save inline edits"}</button>
          <button className="button-secondary" disabled={saving} type="button" onClick={addInlineItem}>Add item</button>
          <button className="button-secondary" disabled={saving} type="button" onClick={removeSelectedItem}>Remove selected</button>
          <button className="button-secondary" disabled={saving} type="button" onClick={openUrlEditor}>Edit URL</button>
          <button className="button-secondary" disabled={saving} type="button" onClick={resetInlineChanges}>Reset unsaved</button>
          <button className="button-secondary" disabled={saving || lastRevertPatches.length === 0} type="button" onClick={undoLastSave}>Undo last save</button>
          {advancedHref ? <a className="button-secondary" href={advancedHref}>Full editor</a> : null}
          <button className="button-secondary" type="button" onClick={cancelInlineEditing}>Cancel</button>
        </div>
      </div>
      {urlDraft ? <div className="inline-url-dialog-shell"><button aria-label="Close URL editor" className="inline-url-dialog-backdrop" onClick={() => setUrlDraft(null)} type="button" /><div aria-describedby="inline-url-help" aria-label="Edit URL" aria-modal="true" className="inline-url-dialog" ref={urlDialogRef} role="dialog"><strong>Edit URL</strong><p className="muted-copy" id="inline-url-help">Allowed: http, https, mailto, or root-relative /paths.</p><label><span>Destination</span><input aria-describedby={urlError ? "inline-url-help inline-url-error" : "inline-url-help"} aria-invalid={Boolean(urlError)} ref={urlInputRef} value={urlDraft.value} onChange={(event) => { setUrlDraft({ ...urlDraft, value: event.target.value }); setUrlError(null); }} /></label>{urlError ? <p className="error-copy" id="inline-url-error" role="alert">{urlError}</p> : null}<div className="hero-actions"><button className="button-primary" type="button" onClick={saveUrlEditor}>Save URL</button><button className="button-secondary" type="button" onClick={() => setUrlDraft(null)}>Cancel</button></div></div></div> : null}
    </>
  );
}
