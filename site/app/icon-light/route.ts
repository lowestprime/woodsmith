import { brandIconSvg } from "@/lib/brand-icon";

export function GET() {
  return new Response(brandIconSvg("light"), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
