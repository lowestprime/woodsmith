"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { isNavigationCurrent } from "@/lib/ui-behavior";

type SiteNavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export function SiteNavLink({ href, children, ...props }: SiteNavLinkProps) {
  const pathname = usePathname();
  const current = isNavigationCurrent(pathname, href);
  return (
    <Link {...props} aria-current={current ? "page" : undefined} data-current={current ? "true" : undefined} href={href}>
      {children}
    </Link>
  );
}
