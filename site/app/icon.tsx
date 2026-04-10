import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050403",
          color: "#f0dec0"
        }}
      >
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            border: "2px solid #f0dec0",
            background: "#15110d",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative"
          }}
        >
          <div style={{ position: "absolute", left: 11, top: 15, width: 17, height: 26, border: "3px solid #f0dec0", borderRight: "0" }} />
          <div style={{ position: "absolute", right: 11, top: 15, width: 17, height: 26, border: "3px solid #f0dec0", borderLeft: "0" }} />
          <div style={{ position: "absolute", width: 34, height: 2, background: "#f0dec0", top: 27 }} />
          <div style={{ position: "absolute", width: 2, height: 38, background: "#f0dec0", left: 26, top: 8 }} />
          <div style={{ position: "absolute", width: 6, height: 6, borderRadius: 999, background: "#f0dec0", left: 24, top: 24 }} />
        </div>
      </div>
    ),
    size
  );
}
