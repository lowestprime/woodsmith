type CookiePolicyEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  "NODE_ENV" | "VISUAL_AUDIT_SNAPSHOT_LAB" | "ALLOW_INSECURE_AUDIT_COOKIES"
>>;

export function secureCookieRequired(environment: CookiePolicyEnvironment = process.env) {
  const isolatedHttpAudit = environment.VISUAL_AUDIT_SNAPSHOT_LAB === "true"
    && environment.ALLOW_INSECURE_AUDIT_COOKIES === "true";

  return environment.NODE_ENV === "production" && !isolatedHttpAudit;
}
