import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beaman Woodworks",
    short_name: "Beaman",
    description: "Handcrafted hardwood furniture, cabinetry, and custom woodwork.",
    start_url: "/",
    display: "standalone",
    background_color: "#010101",
    theme_color: "#1f1912",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" }
    ]
  };
}
