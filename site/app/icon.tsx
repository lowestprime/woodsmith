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
          background: "#090909",
          color: "#f4e6cb"
        }}
      >
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            border: "2px solid #f4e6cb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative"
          }}
        >
          <div style={{ fontSize: 24, letterSpacing: 2 }}>BW</div>
          <div style={{ position: "absolute", width: 30, height: 2, background: "#f4e6cb", top: 26 }} />
          <div style={{ position: "absolute", width: 2, height: 28, background: "#f4e6cb", left: 20, top: 13 }} />
          <div style={{ position: "absolute", width: 2, height: 28, background: "#f4e6cb", right: 20, top: 13 }} />
        </div>
      </div>
    ),
    size
  );
}
