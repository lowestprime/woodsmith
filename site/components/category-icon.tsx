import type { SVGProps } from "react";
import { categoryIconAccessibility, normalizeBuiltinCategoryIcon, type BuiltinCategoryIconName } from "@/lib/category-icons";
import type { PieceCategoryDefinition } from "@/lib/categories";

type IconProps = SVGProps<SVGSVGElement> & {
  name?: string | null;
  category?: Pick<PieceCategoryDefinition, "iconType" | "iconName" | "customIconSvg"> | null;
  label?: string;
};

function BuiltinGeometry({ name }: { name: BuiltinCategoryIconName }) {
  if (name === "all") return <><rect x="8" y="8" width="12" height="12" /><rect x="28" y="8" width="12" height="12" /><rect x="8" y="28" width="12" height="12" /><rect x="28" y="28" width="12" height="12" /></>;
  if (name === "table") return <><path d="M6 15h36v6H6z" /><path d="M11 21v21M37 21v21" /></>;
  if (name === "desk") return <><path d="M5 14h38v7H5zM9 21v21M39 21v21" /><path d="M24 21v12h15M28 27h6" /></>;
  if (name === "side-table") return <><path d="M11 13h26v6H11zM15 19v23M33 19v23M15 30h18" /></>;
  if (name === "bench") return <><path d="M6 20h36v7H6zM11 27v15M37 27v15M11 36h26" /></>;
  if (name === "chair") return <><path d="M14 5v22h22M14 14h22v13M18 27v15M33 27v15" /></>;
  if (name === "stool") return <><path d="M10 16h28v7H10zM15 23l-3 19M33 23l3 19M14 34h20" /></>;
  if (name === "cabinet") return <><rect x="9" y="5" width="30" height="38" /><path d="M24 5v38M9 18h30M20 30h1M27 30h1" /></>;
  if (name === "shelf") return <><path d="M8 9v34M40 9v34M8 16h32M8 29h32M8 42h32" /></>;
  if (name === "door") return <><rect x="11" y="4" width="26" height="40" /><path d="M17 10h14v12H17zM17 27h14v11H17z" /><circle cx="32" cy="25" r="1.5" /></>;
  if (name === "bed") return <><path d="M6 25h36v13H6zM9 17h13a7 7 0 0 1 7 7v1M6 13v29M42 22v20M6 38h36" /></>;
  if (name === "frame") return <><rect x="6" y="6" width="36" height="36" /><rect x="13" y="13" width="22" height="22" /><path d="M13 35l8-9 5 5 4-4 5 8" /></>;
  if (name === "board") return <><path d="M8 12h32v29H8zM18 12V7h12v5" /><path d="M14 21h20M14 28h20M14 35h12" /></>;
  if (name === "easel") return <><path d="M24 5L9 43M24 5l15 38M15 29h18M18 12h12v14H18zM24 26v17" /></>;
  if (name === "clock") return <><circle cx="24" cy="24" r="18" /><path d="M24 12v12l8 5M24 6v3M24 39v3M6 24h3M39 24h3" /></>;
  return <><path d="M24 5l16 10v18L24 43 8 33V15z" /><path d="M8 15l16 10 16-10M24 25v18" /></>;
}

export function CategoryIcon({ name, category, label, className = "", ...props }: IconProps) {
  const accessibility = categoryIconAccessibility(label);
  if (category?.iconType === "custom" && category.customIconSvg) {
    return <span {...accessibility} className={`category-icon-svg category-icon-custom ${className}`.trim()} dangerouslySetInnerHTML={{ __html: category.customIconSvg }} />;
  }
  const iconName = normalizeBuiltinCategoryIcon(category?.iconName ?? name);
  return (
    <svg {...accessibility} className={`category-icon-svg ${className}`.trim()} fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" viewBox="0 0 48 48" {...props}>
      <BuiltinGeometry name={iconName} />
    </svg>
  );
}
