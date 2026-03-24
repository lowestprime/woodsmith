import type { Metadata } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

const mackintosh = localFont({
  variable: "--font-mackintosh",
  display: "swap",
  src: [
    { path: "../fonts/mackintosh-light.otf", weight: "300", style: "normal" },
    { path: "../fonts/mackintosh-regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/mackintosh-semibold.otf", weight: "600", style: "normal" }
  ]
});

export const metadata: Metadata = {
  title: {
    default: "Beaman Woodworks",
    template: "%s | Beaman Woodworks"
  },
  description: "Self-hosted woodworking portfolio, shop, journal, project tracking, and commission management for Beaman Woodworks.",
  applicationName: "Beaman Woodworks"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("beaman-theme")?.value === "light" ? "light" : "dark";

  return (
    <html className={mackintosh.variable} data-theme={theme} lang="en" suppressHydrationWarning>
      <body>
        <div className="site-backdrop" />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
