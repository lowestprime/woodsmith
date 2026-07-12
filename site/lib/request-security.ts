function normalizedOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

export function mutationOriginAllowed(input: {
  requestUrl: string;
  origin?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  configuredOrigins?: Array<string | null | undefined>;
}) {
  const origin = normalizedOrigin(input.origin);
  if (!origin) return false;
  const request = new URL(input.requestUrl);
  const allowed = new Set<string>();
  allowed.add(request.origin.toLowerCase());
  if (input.forwardedHost) {
    const protocol = input.forwardedProto?.split(",")[0]?.trim() || request.protocol.replace(":", "");
    const forwarded = normalizedOrigin(`${protocol}://${input.forwardedHost.split(",")[0]?.trim()}`);
    if (forwarded) allowed.add(forwarded);
  }
  for (const value of input.configuredOrigins ?? []) {
    const configured = normalizedOrigin(value);
    if (configured) allowed.add(configured);
  }
  return allowed.has(origin);
}

export class UntrustedMutationOriginError extends Error {
  readonly status = 403;
}

export function assertTrustedMutationOrigin(request: Request) {
  if (!mutationOriginAllowed({
    requestUrl: request.url,
    origin: request.headers.get("origin"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    configuredOrigins: [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL]
  })) {
    throw new UntrustedMutationOriginError("The request origin is not allowed.");
  }
}
