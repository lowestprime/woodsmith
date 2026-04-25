import type { Metadata } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { VisitorTracker } from "@/components/visitor-tracker";

const mackintosh = localFont({
  variable: "--font-mackintosh",
  display: "swap",
  src: [
    { path: "../fonts/mackintosh-light.otf", weight: "300", style: "normal" },
    { path: "../fonts/mackintosh-regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/mackintosh-semibold.otf", weight: "600", style: "normal" }
  ]
});

const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.woodmat.ch";

export const metadata: Metadata = {
  title: {
    default: "Beaman Woodworks",
    template: "%s | Beaman Woodworks"
  },
  description: "Handcrafted hardwood furniture, cabinetry, and custom woodwork by Beaman Woodworks. Browse the portfolio, shop available pieces, or commission something original.",
  applicationName: "Beaman Woodworks",
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Beaman Woodworks",
    title: "Beaman Woodworks",
    description: "Handcrafted hardwood furniture, cabinetry, and custom woodwork."
  },
  twitter: {
    card: "summary_large_image",
    title: "Beaman Woodworks",
    description: "Handcrafted hardwood furniture, cabinetry, and custom woodwork."
  },
  robots: {
    index: true,
    follow: true
  }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("beaman-theme")?.value === "light" ? "light" : "dark";

  return (
    <html className={mackintosh.variable} data-theme={theme} lang="en" suppressHydrationWarning>
      <body>
        <div className="site-backdrop" />
        <VisitorTracker />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
