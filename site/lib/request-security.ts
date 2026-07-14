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
  configuredOrigins?: Array<string | null | undefined>;
}) {
  const origin = normalizedOrigin(input.origin);
  if (!origin) return false;
  const requestOrigin = normalizedOrigin(input.requestUrl);
  if (!requestOrigin) return false;
  const allowed = new Set<string>();
  allowed.add(requestOrigin);
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
    configuredOrigins: [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL]
  })) {
    throw new UntrustedMutationOriginError("The request origin is not allowed.");
  }
}
