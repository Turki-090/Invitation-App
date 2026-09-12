import { describe, expect, it } from "vitest";
import {
  ALLOWED_MESSAGE_VARIABLES,
  computeInvitationReadiness,
  createInvitationContentSnapshot,
  createInvitationPresentation,
  InvitationContentLocale,
  invitationContentDigestInput,
  InvitationPreparationError,
  InvitationPreparationErrorCode,
  InvitationReadinessIssueCode,
  InvitationReplyIntent,
  messageVariablePlaceholder,
  MessageTemplateIssueCode,
  renderMessageTemplate,
  validateMessageTemplate,
  type InvitationContentSnapshot,
  type InvitationReadinessInput,
} from "./invitation-preparation";
import { InvitationInvariantError } from "./invitation";
import { InvitationType } from "./types";

const readySingleInput = (): InvitationReadinessInput => ({
  event: {
    id: "event-1",
    name: "Mohammed & Noura",
    date: "14 May 2026",
    time: "8:30 PM",
    venue: "Al Masa Hall — Riyadh",
  },
  invitation: {
    id: "invitation-1",
    displayName: "Sarah Al-Qahtani",
    phoneE164: "+966512345678",
    invitationType: InvitationType.SINGLE,
    members: [{ name: "Sarah Al-Qahtani", isPrimary: true }],
    maxCompanions: 0,
    cancelled: false,
  },
  template: {
    id: "template-formal-en",
    locale: InvitationContentLocale.EN,
    approved: true,
    body: "Hello {{guest_name}}, {{event_name}} is on {{event_date}} at {{event_time}}, {{venue}}.",
  },
});

describe("message template placeholders", () => {
  it("publishes a small stable allowlist and canonical placeholder syntax", () => {
    expect(ALLOWED_MESSAGE_VARIABLES).toEqual([
      "guest_name",
      "event_name",
      "event_date",
      "event_time",
      "venue",
      "allowed_companions",
    ]);
    expect(messageVariablePlaceholder("guest_name")).toBe("{{guest_name}}");
  });

  it("returns unique allowed variables in first-use order", () => {
    expect(
      validateMessageTemplate(
        "{{event_name}} welcomes {{guest_name}} to {{event_name}}.",
      ),
    ).toEqual({
      valid: true,
      variables: ["event_name", "guest_name"],
      issues: [],
    });
  });

  it.each([
    ["Hello {{ guest_name }}", MessageTemplateIssueCode.MALFORMED_PLACEHOLDER],
    ["Hello {{guestName}}", MessageTemplateIssueCode.MALFORMED_PLACEHOLDER],
    ["Hello {{unknown_key}}", MessageTemplateIssueCode.UNKNOWN_VARIABLE],
    ["Hello {{guest_name", MessageTemplateIssueCode.MALFORMED_PLACEHOLDER],
    ["Hello guest_name}}", MessageTemplateIssueCode.MALFORMED_PLACEHOLDER],
    ["Hello {{guest_{{name}}", MessageTemplateIssueCode.MALFORMED_PLACEHOLDER],
  ])("rejects unsafe or unsupported syntax in %s", (template, code) => {
    const result = validateMessageTemplate(template);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it("renders values literally without replacement-string or recursive expansion", () => {
    expect(
      renderMessageTemplate(
        "For {{guest_name}}: {{event_name}} / {{guest_name}}",
        {
          guest_name: "$& {{event_name}}",
          event_name: "The wedding",
        },
      ),
    ).toBe("For $& {{event_name}}: The wedding / $& {{event_name}}");
  });

  it("fails closed for an invalid template or a referenced value that is absent", () => {
    expect(() => renderMessageTemplate("{{not_allowed}}", {})).toThrowError(
      expect.objectContaining({
        code: InvitationPreparationErrorCode.MESSAGE_TEMPLATE_INVALID,
      }),
    );
    expect(() =>
      renderMessageTemplate("Hello {{guest_name}}", {}),
    ).toThrowError(
      expect.objectContaining({
        code: InvitationPreparationErrorCode.MESSAGE_VARIABLE_VALUE_MISSING,
        details: ["guest_name"],
      }),
    );
  });

  it("allows ordinary single braces as plain message text", () => {
    expect(
      renderMessageTemplate("Use {formal} with {{guest_name}}", {
        guest_name: "Sarah",
      }),
    ).toBe("Use {formal} with Sarah");
  });
});

describe("type-specific invitation presentation", () => {
  it("creates single-person actions in Arabic and English", () => {
    const base = {
      invitationType: InvitationType.SINGLE,
      members: [{ name: "Sarah", isPrimary: true }],
      maxCompanions: 0,
    } as const;

    expect(
      createInvitationPresentation({
        ...base,
        locale: InvitationContentLocale.AR_SA,
      }),
    ).toEqual({
      scope: "هذه الدعوة خاصة بك.",
      replyActions: [
        {
          id: "ATTEND",
          label: "سأحضر",
          intent: InvitationReplyIntent.ATTEND,
          attendingMemberCount: 1,
          companionCount: 0,
          expectedAttendeeCount: 1,
        },
        {
          id: "DECLINE",
          label: "أعتذر",
          intent: InvitationReplyIntent.DECLINE,
          attendingMemberCount: 0,
          companionCount: 0,
          expectedAttendeeCount: 0,
        },
      ],
    });
    expect(
      createInvitationPresentation({
        ...base,
        locale: InvitationContentLocale.EN,
      }).replyActions.map(({ label }) => label),
    ).toEqual(["I will attend", "Decline"]);
  });

  it("includes named members with immediately actionable family replies", () => {
    const presentation = createInvitationPresentation({
      invitationType: InvitationType.NAMED_GROUP,
      locale: InvitationContentLocale.AR_SA,
      members: ["عبدالله", "منيرة", "خالد", "ريم"].map((name, index) => ({
        name,
        isPrimary: index === 0,
      })),
      maxCompanions: 0,
    });

    expect(presentation.scope).toBe(
      "هذه الدعوة تشمل ٤ أشخاص: عبدالله، منيرة، خالد، ريم.",
    );
    expect(presentation.replyActions).toMatchObject([
      {
        id: "ATTEND_ALL",
        attendingMemberCount: 4,
        expectedAttendeeCount: 4,
      },
      {
        id: "DECLINE_ALL",
        attendingMemberCount: 0,
        expectedAttendeeCount: 0,
      },
    ]);
  });

  it("keeps companion choices within Meta's three-button limit", () => {
    const arabic = createInvitationPresentation({
      invitationType: InvitationType.PRIMARY_WITH_COMPANIONS,
      locale: InvitationContentLocale.AR_SA,
      members: [{ name: "محمد", isPrimary: true }],
      maxCompanions: 2,
    });
    expect(arabic.scope).toBe("هذه الدعوة لك ولمرافقَين اثنين على الأكثر.");
    expect(arabic.replyActions.map(({ id, label }) => ({ id, label }))).toEqual(
      [
        { id: "ATTEND_WITH_0_COMPANIONS", label: "أنا فقط" },
        { id: "ATTEND_WITH_2_COMPANIONS", label: "أنا + ٢" },
        { id: "DECLINE", label: "أعتذر" },
      ],
    );
    expect(arabic.replyActions[1]).toMatchObject({
      attendingMemberCount: 1,
      companionCount: 2,
      expectedAttendeeCount: 3,
    });

    const english = createInvitationPresentation({
      invitationType: InvitationType.PRIMARY_WITH_COMPANIONS,
      locale: InvitationContentLocale.EN,
      members: [{ name: "Mohammed", isPrimary: true }],
      maxCompanions: 1,
    });
    expect(english.scope).toBe(
      "This invitation is for you and up to 1 companion.",
    );
    expect(english.replyActions.map(({ label }) => label)).toEqual([
      "Me only",
      "Me + 1",
      "Decline",
    ]);

    const largest = createInvitationPresentation({
      invitationType: InvitationType.PRIMARY_WITH_COMPANIONS,
      locale: InvitationContentLocale.EN,
      members: [{ name: "Mohammed", isPrimary: true }],
      maxCompanions: 100,
    });
    expect(largest.replyActions).toHaveLength(3);
    expect(largest.replyActions.map(({ id }) => id)).toEqual([
      "ATTEND_WITH_0_COMPANIONS",
      "ATTEND_WITH_100_COMPANIONS",
      "DECLINE",
    ]);
  });

  it("reuses aggregate invariants and rejects blank member names", () => {
    expect(() =>
      createInvitationPresentation({
        invitationType: InvitationType.SINGLE,
        locale: InvitationContentLocale.EN,
        members: [{ name: "Sarah", isPrimary: false }],
        maxCompanions: 0,
      }),
    ).toThrowError(InvitationInvariantError);

    expect(() =>
      createInvitationPresentation({
        invitationType: InvitationType.SINGLE,
        locale: InvitationContentLocale.EN,
        members: [{ name: "  ", isPrimary: true }],
        maxCompanions: 0,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: InvitationPreparationErrorCode.INVITATION_MEMBER_NAME_REQUIRED,
      }),
    );
  });
});

describe("invitation readiness", () => {
  it("marks a valid invitation and approved template ready", () => {
    expect(computeInvitationReadiness(readySingleInput())).toEqual({
      ready: true,
      issues: [],
    });
  });

  it("collects event, invitation, structure, member, and template issues", () => {
    const input = readySingleInput();
    input.event = { id: "", name: " ", date: null, time: undefined, venue: "" };
    input.invitation = {
      ...input.invitation,
      id: "",
      displayName: null,
      phoneE164: "",
      members: [],
      cancelled: true,
    };
    input.template = null;

    const readiness = computeInvitationReadiness(input);
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map(({ code }) => code)).toEqual([
      InvitationReadinessIssueCode.EVENT_ID_MISSING,
      InvitationReadinessIssueCode.EVENT_NAME_MISSING,
      InvitationReadinessIssueCode.EVENT_DATE_MISSING,
      InvitationReadinessIssueCode.EVENT_TIME_MISSING,
      InvitationReadinessIssueCode.EVENT_VENUE_MISSING,
      InvitationReadinessIssueCode.INVITATION_ID_MISSING,
      InvitationReadinessIssueCode.INVITATION_CANCELLED,
      InvitationReadinessIssueCode.INVITATION_DISPLAY_NAME_MISSING,
      InvitationReadinessIssueCode.INVITATION_PHONE_MISSING,
      InvitationReadinessIssueCode.INVITATION_STRUCTURE_INVALID,
      InvitationReadinessIssueCode.TEMPLATE_MISSING,
    ]);
  });

  it("distinguishes invalid phones from valid but noncanonical E.164 storage", () => {
    const invalid = readySingleInput();
    invalid.invitation.phoneE164 = "+966123";
    expect(
      computeInvitationReadiness(invalid).issues.map(({ code }) => code),
    ).toContain(InvitationReadinessIssueCode.INVITATION_PHONE_INVALID);

    const noncanonical = readySingleInput();
    noncanonical.invitation.phoneE164 = "051 234 5678";
    expect(
      computeInvitationReadiness(noncanonical).issues.map(({ code }) => code),
    ).toContain(InvitationReadinessIssueCode.INVITATION_PHONE_NOT_NORMALIZED);
  });

  it("reports approval, placeholder, allowlist, and missing-value problems together", () => {
    const input = readySingleInput();
    input.event.name = " ";
    input.template = {
      id: "template-draft",
      locale: InvitationContentLocale.EN,
      approved: false,
      body: "{{event_name}} {{not_allowed}} {{ guest_name }}",
    };

    const readiness = computeInvitationReadiness(input);
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        InvitationReadinessIssueCode.EVENT_NAME_MISSING,
        InvitationReadinessIssueCode.TEMPLATE_NOT_APPROVED,
        InvitationReadinessIssueCode.TEMPLATE_VARIABLE_NOT_ALLOWED,
        InvitationReadinessIssueCode.TEMPLATE_PLACEHOLDER_MALFORMED,
        InvitationReadinessIssueCode.TEMPLATE_VARIABLE_VALUE_MISSING,
      ]),
    );
    expect(
      readiness.issues.find(
        ({ code }) =>
          code === InvitationReadinessIssueCode.TEMPLATE_VARIABLE_VALUE_MISSING,
      ),
    ).toMatchObject({ variable: "event_name" });
  });

  it("rejects an empty body and an unsupported runtime locale without throwing", () => {
    const empty = readySingleInput();
    empty.template!.body = "  ";
    expect(computeInvitationReadiness(empty).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: InvitationReadinessIssueCode.TEMPLATE_BODY_MISSING,
        }),
      ]),
    );

    const unsupported = readySingleInput();
    unsupported.template!.locale = "fr" as InvitationContentLocale;
    expect(computeInvitationReadiness(unsupported).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: InvitationReadinessIssueCode.TEMPLATE_LOCALE_UNSUPPORTED,
        }),
      ]),
    );
  });
});

describe("immutable invitation content snapshots", () => {
  it("captures only referenced values plus all rendered type-specific content", () => {
    const input = readySingleInput();
    input.template!.body =
      "Hello {{guest_name}} — {{event_name}} — allowance {{allowed_companions}}.";

    const snapshot = createInvitationContentSnapshot(input);
    expect(snapshot).toMatchObject({
      version: 1,
      eventId: "event-1",
      invitationId: "invitation-1",
      templateId: "template-formal-en",
      locale: InvitationContentLocale.EN,
      invitationType: InvitationType.SINGLE,
      recipientName: "Sarah Al-Qahtani",
      memberNames: ["Sarah Al-Qahtani"],
      maxCompanions: 0,
      variables: {
        guest_name: "Sarah Al-Qahtani",
        event_name: "Mohammed & Noura",
        allowed_companions: "0",
      },
      renderedBody: "Hello Sarah Al-Qahtani — Mohammed & Noura — allowance 0.",
      scope: "This invitation is for you.",
    });
    expect(snapshot.variables).not.toHaveProperty("venue");
    expect(snapshot.replyActions).toHaveLength(2);
  });

  it("localizes numeric snapshot variables for Arabic", () => {
    const input = readySingleInput();
    input.invitation = {
      ...input.invitation,
      invitationType: InvitationType.PRIMARY_WITH_COMPANIONS,
      members: [{ name: "محمد", isPrimary: true }],
      displayName: "محمد",
      maxCompanions: 12,
    };
    input.template = {
      id: "template-formal-ar",
      locale: InvitationContentLocale.AR_SA,
      approved: true,
      body: "مرحبًا {{guest_name}}، المرافقون: {{allowed_companions}}.",
    };

    const snapshot = createInvitationContentSnapshot(input);
    expect(snapshot.variables.allowed_companions).toBe("١٢");
    expect(snapshot.renderedBody).toBe("مرحبًا محمد، المرافقون: ١٢.");
    expect(snapshot.scope).toContain("١٢ مرافقين");
  });

  it("produces canonical digest input independent of object key insertion order", () => {
    const snapshot = createInvitationContentSnapshot(readySingleInput());
    const reordered = {
      replyActions: snapshot.replyActions.map((action) => ({
        expectedAttendeeCount: action.expectedAttendeeCount,
        companionCount: action.companionCount,
        attendingMemberCount: action.attendingMemberCount,
        intent: action.intent,
        label: action.label,
        id: action.id,
      })),
      scope: snapshot.scope,
      renderedBody: snapshot.renderedBody,
      variables: Object.fromEntries(
        Object.entries(snapshot.variables).reverse(),
      ),
      templateBody: snapshot.templateBody,
      maxCompanions: snapshot.maxCompanions,
      memberNames: snapshot.memberNames,
      recipientName: snapshot.recipientName,
      invitationType: snapshot.invitationType,
      locale: snapshot.locale,
      templateId: snapshot.templateId,
      invitationId: snapshot.invitationId,
      eventId: snapshot.eventId,
      version: snapshot.version,
    } as InvitationContentSnapshot;

    const digestInput = invitationContentDigestInput(snapshot);
    expect(invitationContentDigestInput(reordered)).toBe(digestInput);
    expect(JSON.parse(digestInput)).toEqual(snapshot);

    const changed = { ...snapshot, renderedBody: `${snapshot.renderedBody}!` };
    expect(invitationContentDigestInput(changed)).not.toBe(digestInput);
  });

  it("refuses to snapshot any invitation with readiness issues", () => {
    const input = readySingleInput();
    input.template!.approved = false;

    expect(() => createInvitationContentSnapshot(input)).toThrowError(
      expect.objectContaining({
        code: InvitationPreparationErrorCode.INVITATION_NOT_READY,
        details: expect.arrayContaining([
          expect.objectContaining({
            code: InvitationReadinessIssueCode.TEMPLATE_NOT_APPROVED,
          }),
        ]),
      }),
    );
  });

  it("exports a typed preparation error", () => {
    const error = new InvitationPreparationError(
      InvitationPreparationErrorCode.INVITATION_NOT_READY,
      "not ready",
    );
    expect(error.name).toBe("InvitationPreparationError");
    expect(error).toBeInstanceOf(Error);
  });
});
