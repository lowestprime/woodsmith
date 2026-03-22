import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

const mackintosh = localFont({
  variable: "--font-woodsmith",
  display: "swap",
  src: [
    {
      path: "../fonts/mackintosh-light.otf",
      weight: "300",
      style: "normal"
    },
    {
      path: "../fonts/mackintosh-regular.otf",
      weight: "400",
      style: "normal"
    },
    {
      path: "../fonts/mackintosh-semibold.otf",
      weight: "600",
      style: "normal"
    }
  ]
});

export const metadata: Metadata = {
  title: "Woodsmith",
  description: "A self-hosted woodworking portfolio, journal, shop, and commission workflow designed for Synology deployment."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={mackintosh.variable} lang="en">
      <body>
        <div className="site-backdrop" />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
