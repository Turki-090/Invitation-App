import "../test/setup";
import type { PublicInvitation, RsvpResult } from "@dawah/api-contract";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { ApiClientError } from "../lib/api";
import { PublicInvitationClient } from "./public-invitation";

const token = "a".repeat(43);
const firstMemberId = "10000000-0000-4000-8000-000000000001";
const secondMemberId = "10000000-0000-4000-8000-000000000002";
const submissionId = "20000000-0000-4000-8000-000000000001";
const respondedAt = "2026-09-11T10:00:00.000Z";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PublicInvitationClient", () => {
  it("submits the named member for a single invitation and shows confirmation", async () => {
    const invitation = makeInvitation("SINGLE");
    const result = makeResult({ attendingMemberIds: [firstMemberId] });
    const submitRsvp = vi.fn().mockResolvedValue(result);
    renderInvitation(invitation, submitRsvp, withResult(invitation, result));

    await userEvent.click(
      screen.getByRole("button", { name: "I will attend" }),
    );

    expect(submitRsvp).toHaveBeenCalledWith(
      token,
      "en",
      expect.objectContaining({
        attendingMemberIds: [firstMemberId],
        companionCount: 0,
        submissionId: expect.any(String),
      }),
    );
    expect(await screen.findByText("Attendance confirmed")).toBeTruthy();
  });

  it("submits exactly the selected named-group members and explains an empty selection", async () => {
    const invitation = makeInvitation("NAMED_GROUP");
    const result = makeResult({ attendingMemberIds: [firstMemberId] });
    const submitRsvp = vi.fn().mockResolvedValue(result);
    renderInvitation(invitation, submitRsvp, withResult(invitation, result));

    await userEvent.click(screen.getByRole("checkbox", { name: "Mona" }));
    expect(screen.getByText("1 of 2 attending")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm attendance" }),
    );

    expect(submitRsvp.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        attendingMemberIds: [firstMemberId],
        companionCount: 0,
      }),
    );
  });

  it("maps a companion choice to the primary member and companion count", async () => {
    const invitation = makeInvitation("PRIMARY_WITH_COMPANIONS");
    const result = makeResult({
      attendingMemberIds: [firstMemberId],
      companionCount: 2,
      expectedAttendees: 3,
    });
    const submitRsvp = vi.fn().mockResolvedValue(result);
    renderInvitation(invitation, submitRsvp, withResult(invitation, result));

    await userEvent.click(screen.getByRole("radio", { name: /Me \+ 2/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm attendance" }),
    );

    expect(submitRsvp.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        attendingMemberIds: [firstMemberId],
        companionCount: 2,
      }),
    );
  });

  it("hides RSVP controls for closed and completed invitations", () => {
    const closed = makeInvitation("SINGLE", {
      lifecycleState: "CLOSED",
      reason: "RSVP_CLOSED",
    });
    const closedRender = renderInvitation(closed, vi.fn(), closed);
    expect(screen.getByText("The RSVP period has ended")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "I will attend" })).toBeNull();

    const completed = makeInvitation("SINGLE", {
      lifecycleState: "COMPLETED",
      reason: "EVENT_COMPLETED",
    });
    closedRender.unmount();
    renderInvitation(completed, vi.fn(), completed);
    expect(
      screen.getByText("Thank you for sharing our celebration"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "I will attend" })).toBeNull();
  });

  it("shows an existing edited response, allows an edit, and preserves a closed response", async () => {
    const base = makeInvitation("NAMED_GROUP");
    const result = makeResult({
      attendingMemberIds: [firstMemberId],
      isEdited: true,
    });
    const editable = withResult(base, result);
    const editableRender = renderInvitation(editable, vi.fn(), editable);

    expect(screen.getByText("This response has been updated")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Change response" }),
    );
    expect(
      screen.getByText("You are editing the recorded response"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("checkbox", { name: "Omar" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: "Mona" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    editableRender.unmount();

    const closed = {
      ...editable,
      policy: {
        canEdit: false,
        canRespond: false,
        lifecycleState: "CLOSED",
        reason: "RSVP_CLOSED",
      },
    } satisfies PublicInvitation;
    renderInvitation(closed, vi.fn(), closed);
    expect(screen.getByText("The RSVP period has ended")).toBeTruthy();
    expect(screen.getByText("Attendance confirmed")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Change response" }),
    ).toBeNull();
  });

  it("renders stable guest messages for unavailable, conflict, and rate-limit responses", async () => {
    const invitation = makeInvitation("SINGLE");
    const cases = [
      {
        error: new ApiClientError("NOT_FOUND", "Not found", 404),
        message: "Invitation link unavailable",
      },
      {
        error: new ApiClientError("CONFLICT", "Conflict", 409),
        message: "The response changed while saving",
      },
      {
        error: new ApiClientError("RATE_LIMIT", "Rate limited", 429),
        message: "There have been too many attempts",
      },
    ];

    for (const testCase of cases) {
      const rendered = renderInvitation(
        invitation,
        vi.fn().mockRejectedValue(testCase.error),
        invitation,
      );
      await userEvent.click(
        screen.getByRole("button", { name: "I will attend" }),
      );
      expect(
        await screen.findByText(new RegExp(testCase.message)),
      ).toBeTruthy();
      rendered.unmount();
    }
  });

  it("uses the bounded guest stepper for larger companion allowances", async () => {
    const base = makeInvitation("PRIMARY_WITH_COMPANIONS");
    const invitation = {
      ...base,
      invitation: { ...base.invitation, maxCompanions: 8 },
    } satisfies PublicInvitation;
    const result = makeResult({
      attendingMemberIds: [firstMemberId],
      companionCount: 8,
      expectedAttendees: 9,
    });
    const submitRsvp = vi.fn().mockResolvedValue(result);
    renderInvitation(invitation, submitRsvp, withResult(invitation, result));

    expect(screen.queryByRole("radiogroup")).toBeNull();
    const increment = screen.getByRole("button", { name: "Add a companion" });
    for (let count = 0; count < 8; count += 1) {
      await userEvent.click(increment);
    }
    expect((increment as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("8")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm attendance" }),
    );

    expect(submitRsvp.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        attendingMemberIds: [firstMemberId],
        companionCount: 8,
      }),
    );
  });

  it("reuses a submission id after an interrupted request and blocks rapid duplicates", async () => {
    const invitation = makeInvitation("SINGLE");
    const result = makeResult({ attendingMemberIds: [firstMemberId] });
    const submitRsvp = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(result);
    const firstRender = renderInvitation(
      invitation,
      submitRsvp,
      withResult(invitation, result),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "I will attend" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Your response could not be saved",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "I will attend" }),
    );

    expect(submitRsvp).toHaveBeenCalledTimes(2);
    expect(submitRsvp.mock.calls[0]?.[2].submissionId).toBe(
      submitRsvp.mock.calls[1]?.[2].submissionId,
    );

    firstRender.unmount();

    const deferred = promiseWithResolvers<RsvpResult>();
    const duplicateGuard = vi.fn().mockReturnValue(deferred.promise);
    const secondRender = renderInvitation(
      makeInvitation("SINGLE"),
      duplicateGuard,
      withResult(invitation, result),
    );
    const attendButtons = screen.getAllByRole("button", {
      name: "I will attend",
    });
    const attend = attendButtons.at(-1);
    if (!attend) throw new Error("Expected the attend button.");
    fireEvent.click(attend);
    fireEvent.click(attend);
    expect(duplicateGuard).toHaveBeenCalledTimes(1);
    deferred.resolve(result);
    await waitFor(() =>
      expect(
        secondRender.queryByRole("button", { name: "I will attend" }),
      ).toBeNull(),
    );
    secondRender.unmount();
  });
});

function renderInvitation(
  invitation: PublicInvitation,
  submitRsvp: ReturnType<typeof vi.fn>,
  refreshed: PublicInvitation,
) {
  return render(component(invitation, submitRsvp, refreshed));
}

function component(
  invitation: PublicInvitation,
  submitRsvp: ReturnType<typeof vi.fn>,
  refreshed: PublicInvitation,
) {
  return (
    <PublicInvitationClient
      copy={en.publicInvitation}
      initialInvitation={invitation}
      loadInvitation={vi.fn().mockResolvedValue(refreshed)}
      locale="en"
      submitRsvp={submitRsvp}
      token={token}
    />
  );
}

function makeInvitation(
  invitationType: PublicInvitation["invitation"]["invitationType"],
  policyOverride: Partial<PublicInvitation["policy"]> = {},
): PublicInvitation {
  const members =
    invitationType === "NAMED_GROUP"
      ? [
          { id: firstMemberId, isPrimary: true, name: "Omar", position: 1 },
          { id: secondMemberId, isPrimary: false, name: "Mona", position: 2 },
        ]
      : [{ id: firstMemberId, isPrimary: true, name: "Omar", position: 1 }];
  return {
    currentRsvp: null,
    event: {
      city: "Riyadh",
      endTime: "22:30",
      eventDate: "2026-10-10",
      eventType: "WEDDING",
      mapUrl: "https://maps.example.test/venue",
      name: "Omar and Mona's wedding",
      rsvpDeadline: "2026-10-01",
      startTime: "18:30",
      timezone: "Asia/Riyadh",
      venueName: "The Garden",
    },
    invitation: {
      displayName: invitationType === "NAMED_GROUP" ? "Omar's family" : "Omar",
      invitationType,
      maxCompanions: invitationType === "PRIMARY_WITH_COMPANIONS" ? 2 : 0,
      members,
    },
    locale: "en",
    policy: {
      canEdit: false,
      canRespond: true,
      lifecycleState: "OPEN",
      reason: "INITIAL_RESPONSE_AVAILABLE",
      ...policyOverride,
    },
  };
}

function makeResult(override: Partial<RsvpResult> = {}): RsvpResult {
  return {
    attendingMemberIds: [],
    changed: true,
    companionCount: 0,
    confirmationQueued: true,
    expectedAttendees: override.attendingMemberIds?.length ?? 0,
    isEdited: false,
    respondedAt,
    status: override.attendingMemberIds?.length ? "ACCEPTED" : "DECLINED",
    submissionId,
    ...override,
  };
}

function withResult(
  invitation: PublicInvitation,
  result: RsvpResult,
): PublicInvitation {
  return {
    ...invitation,
    currentRsvp: {
      attendingMemberIds: result.attendingMemberIds,
      companionCount: result.companionCount,
      expectedAttendees: result.expectedAttendees,
      isEdited: result.isEdited,
      respondedAt: result.respondedAt,
      status: result.status,
      updatedAt: result.respondedAt,
    },
    policy: {
      canEdit: true,
      canRespond: false,
      lifecycleState: "OPEN",
      reason: "EDITS_AVAILABLE",
    },
  };
}

function promiseWithResolvers<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
