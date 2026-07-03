"use client";

import { useState, useTransition } from "react";

type VerificationResendPanelProps = {
  email: string;
};

export function VerificationResendPanel({ email }: VerificationResendPanelProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resend() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/account/resend-verification", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email })
        });
        const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string; notificationId?: string };
        if (!response.ok || !payload.ok) {
          setError(payload.error || `Email verification could not be sent. Backend returned HTTP ${response.status}.`);
          return;
        }
        setMessage(payload.message || `Verification email sent to ${email}.`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Email verification request failed before reaching the server.");
      }
    });
  }

  return (
    <div className="notice-panel" role="alert">
      <strong>Your email is not verified yet.</strong>
      <p className="muted-copy">Use the button below to send a new verification link. If mail transport is unavailable, the exact backend summary will appear here instead of a false success message.</p>
      <button className="button-secondary" disabled={isPending} onClick={resend} type="button">
        {isPending ? "Sending..." : "Resend verification email"}
      </button>
      {message ? <p className="studio-inline-notice" role="status">{message}</p> : null}
      {error ? <p className="studio-inline-notice is-error" role="alert">{error}</p> : null}
    </div>
  );
}
