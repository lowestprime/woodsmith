import type { HTMLAttributes, ReactNode } from "react";

export type InlineEditResource = "settings" | "homeSection" | "page" | "piece" | "post" | "user" | "commissionType";

export type InlineEditTarget = {
  resource: InlineEditResource;
  field: string;
  id?: string;
  index?: number;
};

export function inlineEditAttrs(target?: InlineEditTarget): HTMLAttributes<HTMLElement> {
  if (!target) return {};
  return {
    "data-inline-edit-resource": target.resource,
    "data-inline-edit-field": target.field,
    ...(target.id ? { "data-inline-edit-id": target.id } : {}),
    ...(typeof target.index === "number" ? { "data-inline-edit-index": String(target.index) } : {})
  } as HTMLAttributes<HTMLElement>;
}

export function EditableText({
  as: Component = "span",
  children,
  className,
  target
}: {
  as?: keyof JSX.IntrinsicElements;
  children: ReactNode;
  className?: string;
  target?: InlineEditTarget;
}) {
  const props = inlineEditAttrs(target);
  return <Component className={className} {...props}>{children}</Component>;
}
