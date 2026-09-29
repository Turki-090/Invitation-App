import "../test/setup";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { SignInForm } from "./sign-in-form";
import type { TurnstileApi } from "./turnstile";

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../lib/supabase", () => ({
  getSupabaseClient: () => ({ auth }),
}));

vi.mock("../lib/api", () => ({
  developmentAuthBypassEnabled: false,
}));

type RenderOptions = Parameters<TurnstileApi["render"]>[1];

describe("SignInForm CAPTCHA protection", () => {
  let widgets: RenderOptions[];

  beforeEach(() => {
    widgets = [];
    auth.signInWithOtp.mockResolvedValue({ error: null });
    window.turnstile = {
      render: vi.fn((_container: HTMLElement, options: RenderOptions) => {
        widgets.push(options);
        return `widget-${widgets.length}`;
      }),
      remove: vi.fn(),
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
    vi.clearAllMocks();
  });

  it("sends no code until the challenge is solved, then sends its token once", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAAtestsitekey");
    const user = userEvent.setup();
    render(<SignInForm copy={en.auth} locale="ar-SA" />);
    await waitFor(() => expect(widgets).toHaveLength(1));
    expect(widgets[0]).toMatchObject({
      sitekey: "0x4AAAAAAAtestsitekey",
      language: "ar",
    });

    await user.clear(screen.getByLabelText(new RegExp(en.auth.phoneLabel)));
    await user.type(
      screen.getByLabelText(new RegExp(en.auth.phoneLabel)),
      "0501234567",
    );
    await user.click(screen.getByRole("button", { name: en.auth.sendCode }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      en.auth.captchaRequired,
    );
    expect(auth.signInWithOtp).not.toHaveBeenCalled();

    act(() => widgets[0]!.callback("turnstile-token"));
    await user.click(screen.getByRole("button", { name: en.auth.sendCode }));

    await waitFor(() =>
      expect(auth.signInWithOtp).toHaveBeenCalledWith({
        phone: "+966501234567",
        options: { shouldCreateUser: true, captchaToken: "turnstile-token" },
      }),
    );
  });

  it("never reuses a spent token after a failed request", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAAtestsitekey");
    auth.signInWithOtp.mockResolvedValueOnce({ error: new Error("429") });
    const user = userEvent.setup();
    render(<SignInForm copy={en.auth} locale="en" />);
    await waitFor(() => expect(widgets).toHaveLength(1));
    const phone = screen.getByLabelText(new RegExp(en.auth.phoneLabel));
    await user.clear(phone);
    await user.type(phone, "0501234567");

    act(() => widgets[0]!.callback("first-token"));
    await user.click(screen.getByRole("button", { name: en.auth.sendCode }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      en.auth.sendFailed,
    );

    await waitFor(() => expect(widgets).toHaveLength(2));
    expect(window.turnstile?.remove).toHaveBeenCalledWith("widget-1");
    await user.click(screen.getByRole("button", { name: en.auth.sendCode }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      en.auth.captchaRequired,
    );
    expect(auth.signInWithOtp).toHaveBeenCalledOnce();
  });

  it("leaves the flow unchanged when no site key is configured", async () => {
    const user = userEvent.setup();
    render(<SignInForm copy={en.auth} locale="en" />);

    await user.clear(screen.getByLabelText(new RegExp(en.auth.phoneLabel)));
    await user.type(
      screen.getByLabelText(new RegExp(en.auth.phoneLabel)),
      "0501234567",
    );
    await user.click(screen.getByRole("button", { name: en.auth.sendCode }));

    await waitFor(() =>
      expect(auth.signInWithOtp).toHaveBeenCalledWith({
        phone: "+966501234567",
        options: { shouldCreateUser: true },
      }),
    );
    expect(window.turnstile?.render).not.toHaveBeenCalled();
  });
});
