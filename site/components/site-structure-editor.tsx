"use client";

import { useActionState, useState } from "react";
import type { FooterConfiguration, FooterGroupDefinition, FooterItemDefinition, HomeServiceDefinition } from "@/lib/seed";

type ActionState = { status: "idle" | "success" | "error"; message: string };
type SaveAction = (previousState: ActionState, formData: FormData) => Promise<ActionState>;

const initialState: ActionState = { status: "idle", message: "" };

function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function OrderedButtons({ index, length, label, onMove }: { index: number; length: number; label: string; onMove: (direction: -1 | 1) => void }) {
  return (
    <span className="structure-order-buttons">
      <button aria-label={`Move ${label} earlier`} className="icon-button" disabled={index === 0} onClick={() => onMove(-1)} type="button">↑</button>
      <button aria-label={`Move ${label} later`} className="icon-button" disabled={index === length - 1} onClick={() => onMove(1)} type="button">↓</button>
    </span>
  );
}

export function SiteStructureEditor({ footer: initialFooter, homeServices: initialServices, saveAction }: { footer: FooterConfiguration; homeServices: HomeServiceDefinition[]; saveAction: SaveAction }) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const [footer, setFooter] = useState(initialFooter);
  const [services, setServices] = useState(initialServices);

  const serializedServices = services.map((service, index) => ({ ...service, order: index * 10 }));
  const serializedFooter: FooterConfiguration = {
    ...footer,
    groups: footer.groups.map((group, groupIndex) => ({
      ...group,
      order: groupIndex * 10,
      items: group.items.map((item, itemIndex) => ({ ...item, order: itemIndex * 10 }))
    }))
  };

  function patchService(index: number, patch: Partial<HomeServiceDefinition>) {
    setServices((current) => current.map((service, serviceIndex) => serviceIndex === index ? { ...service, ...patch } : service));
  }

  function patchGroup(index: number, patch: Partial<FooterGroupDefinition>) {
    setFooter((current) => ({ ...current, groups: current.groups.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group) }));
  }

  function patchFooterItem(groupIndex: number, itemIndex: number, patch: Partial<FooterItemDefinition>) {
    setFooter((current) => ({
      ...current,
      groups: current.groups.map((group, currentGroupIndex) => currentGroupIndex === groupIndex
        ? { ...group, items: group.items.map((item, currentItemIndex) => currentItemIndex === itemIndex ? { ...item, ...patch } : item) }
        : group)
    }));
  }

  return (
    <form action={formAction} className="site-structure-editor">
      <input name="homeServicesJson" type="hidden" value={JSON.stringify(serializedServices)} />
      <input name="footerJson" type="hidden" value={JSON.stringify(serializedFooter)} />

      <section className="studio-panel structure-editor-section">
        <div className="studio-editor-head"><div><p className="eyebrow">Homepage</p><h3>Service links</h3><p className="muted-copy">Every card has a visible destination and can be reordered or hidden.</p></div><button className="button-secondary" onClick={() => setServices((current) => [...current, { id: nextId("service"), title: "New service", body: "Describe what visitors will find.", href: "/contact", linkLabel: "Open", visible: true, order: current.length * 10 }])} type="button">Add service</button></div>
        <div className="structure-editor-list">
          {services.map((service, index) => (
            <details className="structure-editor-row" key={service.id} open={index === 0}>
              <summary><span>{service.title}</span><span className="structure-row-meta">{service.visible ? "Visible" : "Hidden"}</span></summary>
              <div className="structure-editor-fields">
                <div className="field-grid two-up compact-grid"><label><span>Title</span><input onChange={(event) => patchService(index, { title: event.target.value })} value={service.title} /></label><label><span>Destination</span><input onChange={(event) => patchService(index, { href: event.target.value })} value={service.href} /></label></div>
                <label><span>Description</span><textarea onChange={(event) => patchService(index, { body: event.target.value })} rows={3} value={service.body} /></label>
                <div className="field-grid two-up compact-grid"><label><span>Link label</span><input onChange={(event) => patchService(index, { linkLabel: event.target.value })} value={service.linkLabel} /></label><label className="checkbox-row"><input checked={service.visible} onChange={(event) => patchService(index, { visible: event.target.checked })} type="checkbox" /><span>Visible</span></label></div>
                <div className="structure-row-actions"><OrderedButtons index={index} label={service.title} length={services.length} onMove={(direction) => setServices((current) => moveItem(current, index, direction))} /><button className="button-secondary" disabled={services.length === 1} onClick={() => setServices((current) => current.filter((_, currentIndex) => currentIndex !== index))} type="button">Remove</button></div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="studio-panel structure-editor-section">
        <div className="studio-editor-head"><div><p className="eyebrow">Site footer</p><h3>Groups and links</h3><p className="muted-copy">Edit headings, contact details, credits, and link behavior without punctuation separators.</p></div><button className="button-secondary" onClick={() => setFooter((current) => ({ ...current, groups: [...current.groups, { id: nextId("group"), heading: "New group", visible: true, order: current.groups.length * 10, items: [{ id: nextId("item"), label: "Label", value: "Value", url: "", type: "text", visible: true, newTab: false, order: 0 }] }] }))} type="button">Add group</button></div>
        <div className="field-grid two-up compact-grid"><label><span>Footer heading</span><input onChange={(event) => setFooter((current) => ({ ...current, introHeading: event.target.value }))} value={footer.introHeading} /></label><label><span>Footer introduction</span><textarea onChange={(event) => setFooter((current) => ({ ...current, introBody: event.target.value }))} rows={2} value={footer.introBody} /></label></div>
        <div className="structure-editor-list">
          {footer.groups.map((group, groupIndex) => (
            <details className="structure-editor-row" key={group.id}>
              <summary><span>{group.heading}</span><span className="structure-row-meta">{group.items.length} item{group.items.length === 1 ? "" : "s"}</span></summary>
              <div className="structure-editor-fields">
                <div className="field-grid two-up compact-grid"><label><span>Group heading</span><input onChange={(event) => patchGroup(groupIndex, { heading: event.target.value })} value={group.heading} /></label><label className="checkbox-row"><input checked={group.visible} onChange={(event) => patchGroup(groupIndex, { visible: event.target.checked })} type="checkbox" /><span>Visible</span></label></div>
                <div className="footer-editor-items">
                  {group.items.map((item, itemIndex) => (
                    <article className="footer-editor-item" key={item.id}>
                      <div className="field-grid three-up compact-grid">
                        <label><span>Label</span><input onChange={(event) => patchFooterItem(groupIndex, itemIndex, { label: event.target.value })} value={item.label} /></label>
                        <label><span>Displayed value</span><input onChange={(event) => patchFooterItem(groupIndex, itemIndex, { value: event.target.value })} value={item.value} /></label>
                        <label><span>Type</span><select onChange={(event) => patchFooterItem(groupIndex, itemIndex, { type: event.target.value as FooterItemDefinition["type"] })} value={item.type}><option value="text">Text</option><option value="internal-link">Site link</option><option value="external-link">External link</option><option value="email">Email</option></select></label>
                      </div>
                      {item.type !== "text" ? <label><span>Destination</span><input onChange={(event) => patchFooterItem(groupIndex, itemIndex, { url: event.target.value })} placeholder={item.type === "email" ? "mailto:name@example.com" : "/page or https://example.com"} value={item.url} /></label> : null}
                      <div className="structure-row-actions"><label className="checkbox-row"><input checked={item.visible} onChange={(event) => patchFooterItem(groupIndex, itemIndex, { visible: event.target.checked })} type="checkbox" /><span>Visible</span></label>{item.type === "external-link" ? <label className="checkbox-row"><input checked={item.newTab} onChange={(event) => patchFooterItem(groupIndex, itemIndex, { newTab: event.target.checked })} type="checkbox" /><span>New tab</span></label> : null}<OrderedButtons index={itemIndex} label={item.label} length={group.items.length} onMove={(direction) => patchGroup(groupIndex, { items: moveItem(group.items, itemIndex, direction) })} /><button className="button-secondary" disabled={group.items.length === 1} onClick={() => patchGroup(groupIndex, { items: group.items.filter((_, currentIndex) => currentIndex !== itemIndex) })} type="button">Remove item</button></div>
                    </article>
                  ))}
                </div>
                <div className="structure-row-actions"><button className="button-secondary" onClick={() => patchGroup(groupIndex, { items: [...group.items, { id: nextId("item"), label: "Label", value: "Value", url: "", type: "text", visible: true, newTab: false, order: group.items.length * 10 }] })} type="button">Add item</button><OrderedButtons index={groupIndex} label={group.heading} length={footer.groups.length} onMove={(direction) => setFooter((current) => ({ ...current, groups: moveItem(current.groups, groupIndex, direction) }))} /><button className="button-secondary" disabled={footer.groups.length === 1} onClick={() => setFooter((current) => ({ ...current, groups: current.groups.filter((_, currentIndex) => currentIndex !== groupIndex) }))} type="button">Remove group</button></div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <div className="structure-save-bar"><button className="button-primary" disabled={pending} type="submit">{pending ? "Saving..." : "Save homepage and footer"}</button>{state.message ? <p className={`form-status ${state.status}`} role="status">{state.message}</p> : null}</div>
    </form>
  );
}
