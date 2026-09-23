// Pending verification sessions can edit their own profile, but cannot claim email-owned records.
export function accountEmailVerified(user: {role: string; emailVerified: boolean} | null | undefined) {
  return Boolean(user && (user.role !== "customer" || user.emailVerified));
}

export function safeAccountRedirect(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/account/profile";
  try {
    const base = "https://account.invalid";
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : "/account/profile";
  } catch { return "/account/profile"; }
}
