import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSiteSettings, upsertVisitorSession } from "@/lib/db";
import { sendNotificationEmail } from "@/lib/notifications";

function hashIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex");
}

function toNullableNumber(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as {
      path?: string;
      referrer?: string;
      sessionToken?: string;
    };

    const sessionToken = (payload.sessionToken || "").trim();
    const path = (payload.path || "").trim();
    if (!sessionToken || !path) {
      return NextResponse.json({ ok: false, message: "Missing path or session token." }, { status: 400 });
    }

    const countryCode = request.headers.get("cf-ipcountry") || request.headers.get("x-vercel-ip-country") || null;
    const city = request.headers.get("cf-ipcity") || null;
    const region = request.headers.get("cf-region") || request.headers.get("cf-region-code") || null;
    const latitude = toNullableNumber(request.headers.get("cf-iplatitude"));
    const longitude = toNullableNumber(request.headers.get("cf-iplongitude"));
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = request.headers.get("cf-connecting-ip") || (forwarded ? forwarded.split(",")[0]?.trim() : "") || "";

    const result = upsertVisitorSession({
      sessionToken,
      path,
      referrer: payload.referrer?.trim() || null,
      host: request.headers.get("host"),
      countryCode,
      city,
      region,
      latitude,
      longitude,
      ipHash: ip ? hashIp(ip) : null,
      cfRay: request.headers.get("cf-ray"),
      userAgent: request.headers.get("user-agent")
    });

    if (result.created) {
      const site = getSiteSettings();
      const notifyTo = site.notificationForwardEmail || site.builderEmail;
      if (notifyTo) {
        void sendNotificationEmail({
          category: "visitor_session",
          to: notifyTo,
          subject: `New visitor${countryCode ? ` · ${countryCode}` : ""}`,
          text: `A new visitor session was recorded.\n\nPath: ${path}\nCountry: ${countryCode ?? "Unknown"}\nCity: ${city ?? "Unknown"}\nRegion: ${region ?? "Unknown"}\nHost: ${request.headers.get("host") ?? "Unknown"}\nAt: ${result.record.firstSeenAt}`,
          variables: {
            path,
            country: countryCode ?? "Unknown",
            city: city ?? "Unknown",
            region: region ?? "Unknown",
            host:
              request.headers.get("host") ??
              "Unknown",
            firstSeenAt:
              result.record.firstSeenAt
          },
          idempotencyKey:
            `visitor-session:${result.record.id}`
        }).catch(() => undefined);
      }
    }

    return NextResponse.json({ ok: true, created: result.created });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "Visit logging failed."
    }, { status: 500 });
  }
}
