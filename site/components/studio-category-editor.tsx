"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { BUILTIN_CATEGORY_ICONS, sanitizeCategoryIconSvg, type BuiltinCategoryIconName } from "@/lib/category-icons";
import type { PieceCategoryDefinition } from "@/lib/categories";

export type CategoryActionState = {
  status: "idle" | "success" | "error";
  message: string;
  categoryKey?: string;
};

type CategoryAction = (previousState: CategoryActionState, formData: FormData) => Promise<CategoryActionState>;

const initialState: CategoryActionState = { status: "idle", message: "" };

export function StudioCategoryEditor({
  category,
  categories,
  deleteAction,
  isNew = false,
  saveAction
}: {
  category: PieceCategoryDefinition;
  categories: PieceCategoryDefinition[];
  deleteAction: CategoryAction;
  isNew?: boolean;
  saveAction: CategoryAction;
}) {
  const [saveState, saveFormAction, saving] = useActionState(saveAction, initialState);
  const [deleteState, deleteFormAction, deleting] = useActionState(deleteAction, initialState);
  const [iconType, setIconType] = useState(category.iconType);
  const [iconName, setIconName] = useState<BuiltinCategoryIconName>(category.iconName);
  const [customIconSvg, setCustomIconSvg] = useState(category.customIconSvg ?? "");

  let safeCustomIcon: string | null = null;
  let customIconError = "";
  if (iconType === "custom" && customIconSvg.trim()) {
    try {
      safeCustomIcon = sanitizeCategoryIconSvg(customIconSvg);
    } catch (error) {
      customIconError = error instanceof Error ? error.message : "The custom icon could not be read.";
    }
  }

  const previewCategory = {
    ...category,
    icon: iconName,
    iconName,
    iconType: iconType === "custom" && safeCustomIcon ? "custom" as const : "builtin" as const,
    customIconSvg: safeCustomIcon
  };

  async function importSvg(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 12_000) {
      setCustomIconSvg("");
      return;
    }
    setCustomIconSvg(await file.text());
    setIconType("custom");
  }

  return (
    <article className="studio-panel category-editor" id={`category-${category.key}`}>
      <header className="category-editor-head">
        <span aria-hidden="true" className="category-editor-preview"><CategoryIcon category={previewCategory} /></span>
        <div><p className="eyebrow">{isNew ? "New portfolio group" : "Portfolio group"}</p><h3>{category.label}</h3></div>
      </header>

      <form action={saveFormAction} className="request-form compact-form category-editor-form">
        <input name="originalKey" type="hidden" value={isNew ? "" : category.key} />
        <input name="iconType" type="hidden" value={iconType} />
        <input name="iconName" type="hidden" value={iconName} />
        <input name="visibilityControlled" type="hidden" value="1" />
        <div className="field-grid two-up compact-grid">
          <label><span>Key</span><input defaultValue={category.key} name="key" required /></label>
          <label><span>Public label</span><input defaultValue={category.label} name="label" required /></label>
        </div>

        <fieldset className="category-icon-fieldset">
          <legend>Icon</legend>
          <div className="category-icon-gallery">
            {BUILTIN_CATEGORY_ICONS.filter((icon) => icon.name !== "all").map((icon) => (
              <label className={`category-icon-choice${iconType === "builtin" && iconName === icon.name ? " is-selected" : ""}`} key={icon.name}>
                <input checked={iconType === "builtin" && iconName === icon.name} name={`icon-choice-${category.key}`} onChange={() => { setIconType("builtin"); setIconName(icon.name); }} type="radio" />
                <CategoryIcon name={icon.name} />
                <span>{icon.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <details className="category-custom-icon" open={iconType === "custom"}>
          <summary>Use a custom SVG icon</summary>
          <div className="category-custom-icon-controls">
            <label className="button-secondary category-icon-upload">Import SVG<input accept="image/svg+xml,.svg" onChange={importSvg} type="file" /></label>
            <button className="button-secondary" onClick={() => setIconType("builtin")} type="button">Use built-in</button>
          </div>
          <label><span>Sanitized SVG markup</span><textarea name="customIconSvg" onChange={(event) => { setCustomIconSvg(event.target.value); setIconType("custom"); }} rows={4} value={customIconSvg} /></label>
          {customIconError ? <p className="form-status error" role="alert">{customIconError}</p> : <p className="field-help">Only geometry, color, and transform attributes are retained. Scripts, links, styles, and external assets are rejected.</p>}
        </details>

        <div className="field-grid two-up compact-grid">
          <label><span>Display order</span><input defaultValue={category.sortOrder} min="0" name="sortOrder" step="1" type="number" /></label>
          <label className="checkbox-row"><input defaultChecked={category.visible} name="visible" type="checkbox" /><span>Show in portfolio filters</span></label>
        </div>
        <label><span>Matching terms, one per line</span><textarea defaultValue={category.aliases.join("\n")} name="aliasesText" rows={3} /></label>
        <div className="category-editor-actions">
          <button className="button-primary" disabled={saving || Boolean(customIconError)} type="submit">{saving ? "Saving…" : isNew ? "Add category" : "Save category"}</button>
          {saveState.message ? <p className={`form-status ${saveState.status}`} role="status">{saveState.message}</p> : null}
        </div>
      </form>

      {!isNew ? (
        <details className="category-delete-panel">
          <summary>Delete or consolidate</summary>
          <form action={deleteFormAction} className="request-form compact-form">
            <input name="key" type="hidden" value={category.key} />
            <label><span>Move assigned pieces first</span><select defaultValue="" name="replacementKey"><option value="">Delete only when unused</option>{categories.filter((entry) => entry.key !== category.key).map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label>
            <button className="button-secondary" disabled={deleting} type="submit">{deleting ? "Deleting…" : "Delete category"}</button>
            {deleteState.message ? <p className={`form-status ${deleteState.status}`} role="status">{deleteState.message}</p> : null}
          </form>
        </details>
      ) : null}
    </article>
  );
}
