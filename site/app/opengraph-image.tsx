import { ImageResponse } from "next/og";
import { brandIconDataUri } from "@/lib/brand-icon";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          background: "#050403",
          color: "#f0dec0",
          padding: "72px"
        }}
      >
        <img alt="Beaman Woodworks" src={brandIconDataUri("dark")} style={{ width: 240, height: 240 }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 78, lineHeight: 1.05, letterSpacing: -1 }}>Beaman Woodworks</div>
          <div style={{ marginTop: 24, maxWidth: 650, fontSize: 34, lineHeight: 1.25, color: "#d9c4a5" }}>
            Handcrafted furniture, cabinetry, and custom woodwork.
          </div>
        </div>
      </div>
    ),
    size
  );
}
