"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { TurnstileClientConfiguration } from "@/lib/turnstile";

type TurnstileApi = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void; reset: (id: string) => void };
declare global { interface Window { turnstile?: TurnstileApi } }

export function InquiryTurnstile({ configuration, resetKey }: { configuration: TurnstileClientConfiguration; resetKey: unknown }) {
  const element = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [previousResetKey, setPreviousResetKey] = useState(resetKey);
  if (previousResetKey !== resetKey) {
    setPreviousResetKey(resetKey);
    setToken("");
    setError("");
  }
  useEffect(() => {
    if (!ready || configuration.mode !== "managed" || !element.current || !window.turnstile) return;
    const api = window.turnstile;
    widget.current = api.render(element.current, {
      sitekey: configuration.siteKey, action: "website-inquiry", theme: "auto", size: "flexible", "response-field": false,
      callback: (value: string) => { setToken(value); setError(""); },
      "error-callback": () => { setToken(""); setError("The security check could not load. Retry the check or email the woodshop."); },
      "expired-callback": () => { setToken(""); setError("The security check expired. Please retry it before submitting."); }
    });
    return () => { if (widget.current) api.remove(widget.current); widget.current = null; };
  }, [configuration.mode, configuration.siteKey, ready]);
  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [resetKey]);
  if (configuration.mode === "unavailable") return <p role="status" className="notice-panel">Online verification is unavailable. Please try later or email the woodshop.</p>;
  return <div className="inquiry-verification">
    <input name="cf-turnstile-response" type="hidden" value={token} />
    {configuration.mode === "test" ? <label><span>Isolated test security check</span><select value={token} onChange={event => setToken(event.target.value)}><option value="">Not completed</option><option value="test-pass">Pass</option><option value="test-fail">Fail</option></select></label> : <>
      <Script id="inquiry-turnstile-script" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setError("The security check could not load. Check your connection or email the woodshop.")} />
      <div aria-label="Security check" ref={element} />
      <button className="text-button" type="button" onClick={() => { setToken(""); setError(""); if (widget.current) window.turnstile?.reset(widget.current); }}>Retry security check</button>
    </>}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
