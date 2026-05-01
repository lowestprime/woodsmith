import { ImageResponse } from "next/og";
import { brandIconDataUri } from "@/lib/brand-icon";

export const size = {
  width: 180,
  height: 180
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <img alt="Beaman Woodworks" src={brandIconDataUri("dark")} style={{ width: "100%", height: "100%" }} />,
    size
  );
}
