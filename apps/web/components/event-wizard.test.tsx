import "../test/setup";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { EventWizard } from "./event-wizard";

describe("event onboarding wizard", () => {
  it("supports keyboard event-type selection and validates each step", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <EventWizard
        common={en.common}
        copy={en.events}
        loading={false}
        locale="en"
        onClose={() => undefined}
        onSubmit={onSubmit}
        open
        submitError={false}
      />,
    );

    const wedding = screen.getByRole("radio", { name: /Wedding/ });
    wedding.focus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen
        .getByRole("radio", { name: /Engagement/ })
        .getAttribute("aria-checked"),
    ).toBe("true");

    await user.click(screen.getByRole("button", { name: en.events.next }));
    expect(screen.getByText("Step 2 of 4")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: en.events.next }));
    expect(screen.getByText("Step 2 of 4")).toBeTruthy();
    expect(screen.getAllByText(en.events.invalidField).length).toBeGreaterThan(
      0,
    );

    await user.type(
      screen.getByLabelText(new RegExp(en.events.nameAr)),
      "حفل خطوبة خالد ونورة",
    );
    fireEvent.change(screen.getByLabelText(new RegExp(en.events.eventDate)), {
      target: { value: "2027-04-18" },
    });
    await user.type(
      screen.getByLabelText(new RegExp(en.events.venueNameAr)),
      "قاعة الماسة",
    );
    await user.click(screen.getByRole("button", { name: en.events.next }));
    expect(screen.getByText("Step 3 of 4")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: en.events.next }));
    expect(screen.getByText("Step 4 of 4")).toBeTruthy();
    expect(screen.getByText(en.events.reviewReady)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: en.events.finish }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ENGAGEMENT",
        nameAr: "حفل خطوبة خالد ونورة",
        eventDate: "2027-04-18",
        startTime: "20:00",
        timezone: "Asia/Riyadh",
        venueNameAr: "قاعة الماسة",
        city: "Riyadh",
        allowRsvpEdits: true,
        qrEnabled: false,
      }),
      expect.anything(),
    );
  });

  it("resets to the first step when dismissed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <EventWizard
        common={en.common}
        copy={en.events}
        loading={false}
        locale="en"
        onClose={onClose}
        onSubmit={() => undefined}
        open
        submitError={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: en.common.cancel }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
  });
});
