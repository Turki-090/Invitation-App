"use client";

import React, { useEffect, useRef } from "react";

/** Origin allowed by the content security policy when a site key is set. */
const turnstileOrigin = "https://challenges.cloudflare.com";
const scriptUrl = `${turnstileOrigin}/turnstile/v0/api.js?render=explicit`;

interface TurnstileRenderOptions {
  sitekey: string;
  language: string;
  theme: "auto";
  size: "flexible";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile did not initialize."));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Turnstile could not be loaded."));
    };
    document.head.append(script);
  });
  return loading;
}

interface TurnstileProps {
  siteKey: string;
  language: string;
  /** Receives a single-use token, or null once it expires or fails. */
  onToken: (token: string | null) => void;
  onUnavailable: () => void;
}

/**
 * Cloudflare Turnstile challenge whose token Supabase Auth verifies before it
 * sends a sign-in code. Tokens are single use, so the caller remounts this
 * component (with a new `key`) after every code request.
 */
export function Turnstile({
  siteKey,
  language,
  onToken,
  onUnavailable,
}: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onToken, onUnavailable });
  useEffect(() => {
    callbacks.current = { onToken, onUnavailable };
  });

  useEffect(() => {
    let widgetId: string | null = null;
    let active = true;
    loadTurnstile()
      .then((turnstile) => {
        if (!active || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          language,
          theme: "auto",
          size: "flexible",
          callback: (token) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": () => {
            callbacks.current.onToken(null);
            callbacks.current.onUnavailable();
          },
        });
      })
      .catch(() => {
        if (active) callbacks.current.onUnavailable();
      });
    return () => {
      active = false;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, language]);

  return <div className="turnstile" ref={container} />;
}
