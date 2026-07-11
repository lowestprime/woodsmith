import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from "react";

export type InlineEditResource = "settings" | "homeSection" | "page" | "piece" | "post" | "user";

export type InlineEditTarget = {
  resource: InlineEditResource;
  field: string;
  id?: string;
  index?: number;
  urlField?: string;
};

export function inlineEditAttrs(target?: InlineEditTarget): HTMLAttributes<HTMLElement> {
  if (!target) return {};
  return {
    "data-inline-edit-resource": target.resource,
    "data-inline-edit-field": target.field,
    ...(target.id ? { "data-inline-edit-id": target.id } : {}),
    ...(typeof target.index === "number" ? { "data-inline-edit-index": String(target.index) } : {}),
    ...(target.urlField ? { "data-inline-edit-url-field": target.urlField } : {})
  } as HTMLAttributes<HTMLElement>;
}

export function EditableText({
  as: Component = "span",
  children,
  className,
  target
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  target?: InlineEditTarget;
}) {
  const props = inlineEditAttrs(target);
  return createElement(Component, { ...props, className }, children);
}
