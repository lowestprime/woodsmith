import { randomUUID } from "node:crypto";

type Environment = Record<string, string | undefined>;
export type TurnstileClientConfiguration = { mode: "managed" | "test" | "unavailable"; siteKey: string };

function isolatedTestAllowed(env: Environment) {
  if (env.NODE_ENV === "test") return true;
  try {
    const host = new URL(env.SITE_URL || "").hostname;
    return env.VISUAL_AUDIT_SNAPSHOT_LAB === "true" && env.DATA_ROOT === "/tmp/data" && env.MEDIA_ROOT === "/tmp/media" && /^woodsmith-intakeqa-[a-z0-9-]+-app$/.test(host);
  } catch { return false; }
}

export function getTurnstileClientConfiguration(env: Environment = process.env): TurnstileClientConfiguration {
  if (env.TURNSTILE_MODE === "test") return { mode: isolatedTestAllowed(env) ? "test" : "unavailable", siteKey: "" };
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() || "";
  const secret = env.TURNSTILE_SECRET_KEY?.trim() || "";
  // Cloudflare's public always-pass/fail dummy keys must never protect production.
  const dummy = /^[123]x0{8,}/.test(siteKey) || /^[123]x0{8,}/.test(secret);
  return { mode: siteKey && secret && !dummy && (!env.TURNSTILE_MODE || env.TURNSTILE_MODE === "managed") ? "managed" : "unavailable", siteKey: siteKey && !dummy ? siteKey : "" };
}

export async function verifyInquiryTurnstile(token: unknown, options: { env?: Environment; fetcher?: typeof fetch; now?: number } = {}) {
  const env = options.env ?? process.env;
  const config = getTurnstileClientConfiguration(env);
  if (config.mode === "unavailable") throw new Error("Online verification is unavailable. Please try later or email the woodshop.");
  if (typeof token !== "string" || !token.trim() || token.length > 2048) throw new Error("Complete the security check, then submit again.");
  if (config.mode === "test") {
    if (token !== "test-pass") throw new Error("The security check failed. Please retry the check and submit again.");
    return;
  }
  let hostname: string;
  try { hostname = new URL(env.SITE_URL || "").hostname; } catch { throw new Error("Online verification is unavailable. Please email the woodshop."); }
  try {
    const response = await (options.fetcher ?? fetch)("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, idempotency_key: randomUUID() })
    });
    if (!response.ok) throw new Error("verification-unavailable");
    const result = await response.json() as { success?: unknown; hostname?: unknown; action?: unknown; challenge_ts?: unknown };
    const issued = typeof result.challenge_ts === "string" ? Date.parse(result.challenge_ts) : NaN;
    const age = (options.now ?? Date.now()) - issued;
    if (result.success !== true || result.hostname !== hostname || result.action !== "website-inquiry" || !Number.isFinite(age) || age < -60_000 || age > 300_000) throw new Error("verification-invalid");
  } catch {
    // Never include a submitted token, secret, provider response or customer data.
    throw new Error("The security check failed or expired. Please retry the check and submit again.");
  }
}
