import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getNotificationPolicy,
  getSiteSettings,
  recordVisitorPageview
} from "@/lib/db";
import { sendNotificationEmail } from "@/lib/notifications";
import {
  createVisitorPseudonyms,
  inspectVisitorRequest,
  normalizeVisitorPath,
  resolveVisitorIdentityKey
} from "@/lib/visitor-privacy";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as {
      path?: string;
      referrer?: string;
      sessionToken?: string;
    };

    const sessionToken = (payload.sessionToken || "").trim();
    const path = normalizeVisitorPath(payload.path);
    if (!sessionToken || !path) {
      return NextResponse.json({ ok: false, message: "Missing path or session token." }, { status: 400 });
    }

    const currentUser = await getCurrentUser();
    if (currentUser?.role === "admin") {
      return NextResponse.json({
        ok: true,
        recorded: false
      });
    }
    const facts = inspectVisitorRequest({
      headers: request.headers,
      path,
      referrer: payload.referrer,
      allowInternal:
        process.env.VISITOR_TRACK_INTERNAL === "true"
    });
    if (facts.filteredReason) {
      return NextResponse.json({
        ok: true,
        recorded: false
      });
    }
    const identityKey = resolveVisitorIdentityKey();
    if (!identityKey) {
      return NextResponse.json({
        ok: true,
        recorded: false,
        configurationNeeded: true
      }, { status: 202 });
    }
    const pseudonyms = createVisitorPseudonyms({
      key: identityKey,
      sessionToken,
      rawIp: facts.rawIp
    });

    const result = recordVisitorPageview({
      visitorPseudonym:
        pseudonyms.visitorPseudonym,
      sessionPseudonym:
        pseudonyms.sessionPseudonym,
      pseudonymKeyId: pseudonyms.keyId,
      path,
      host: facts.host,
      referrerHost: facts.referrerHost,
      countryCode: facts.location.countryCode,
      city: facts.location.city,
      region: facts.location.region,
      deviceClass: facts.deviceClass
    });

    const notificationPolicy =
      getNotificationPolicy(
        "visitor_session"
      );
    if (
      result.recorded &&
      result.created &&
      notificationPolicy?.enabled
    ) {
      const site = getSiteSettings();
      const notifyTo = site.notificationForwardEmail || site.builderEmail;
      if (notifyTo) {
        void sendNotificationEmail({
          category: "visitor_session",
          to: notifyTo,
          subject: `New visitor${facts.location.countryCode ? ` · ${facts.location.countryCode}` : ""}`,
          text: "A new visitor session was recorded.",
          variables: {
            path,
            country: facts.location.countryCode ?? "Unknown",
            city: facts.location.city ?? "Unknown",
            region: facts.location.region ?? "Unknown",
            host: facts.host ?? "Unknown",
            firstSeenAt:
              result.record.firstSeenAt
          },
          idempotencyKey:
            `visitor-session:${result.record.id}`
        }).catch(() => undefined);
      }
    }

    return NextResponse.json({
      ok: true,
      recorded: result.recorded,
      created: result.created,
      pageviewCreated: result.pageviewCreated
    });
  } catch {
    return NextResponse.json({
      ok: false,
      message: "Visit logging failed."
    }, { status: 500 });
  }
}
