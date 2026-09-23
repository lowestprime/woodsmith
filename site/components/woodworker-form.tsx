"use client";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  woodworkerAction,
  woodworkerAdminAction,
} from "@/lib/woodworker-actions";

export function WoodworkerForm({
  children,
  admin = false,
  submitLabel = "Save",
}: {
  children: ReactNode;
  admin?: boolean;
  submitLabel?: string;
}) {
  const router = useRouter(),
    formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition(),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  return (
    <form
      method="post"
      className="request-form compact-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !formRef.current) return;
        const data = new FormData(formRef.current);
        setMessage("");
        startTransition(async () => {
          try {
            const result = await (
              admin ? woodworkerAdminAction : woodworkerAction
            )(data);
            setMessage(result.message);
            setFailed(!result.ok);
            if (result.ok) {
              if (!admin && result.panel)
                router.replace(
                  `/studio/woodworker?panel=${encodeURIComponent(result.panel)}${result.key ? `&selected=${encodeURIComponent(result.key)}` : ""}`,
                );
              router.refresh();
            }
          } catch {
            setFailed(true);
            setMessage(
              "The response was interrupted. Reload to check the saved record before trying again.",
            );
          }
        });
      }}
      ref={formRef}
    >
      <fieldset
        disabled={pending}
        style={{
          border: 0,
          padding: 0,
          minWidth: 0,
          display: "grid",
          gap: "1rem",
        }}
      >
        {children}
        <button className="button-primary" type="submit">
          {pending ? "Saving…" : submitLabel}
        </button>
      </fieldset>
      {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
    </form>
  );
}
