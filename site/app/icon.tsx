import { ImageResponse } from "next/og";
import { brandIconDataUri } from "@/lib/brand-icon";

export const size = {
  width: 512,
  height: 512
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <img alt="Beaman Woodworks" src={brandIconDataUri("dark")} style={{ width: "100%", height: "100%" }} />,
    size
  );
}
