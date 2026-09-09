import { describe, expect, it } from "vitest";
import {
  confirmImportSchema,
  createInvitationTemplateSchema,
  createPreparationSnapshotsSchema,
  importColumnMappingSchema,
  invitationPreviewSchema,
  updateImportRowSchema,
  updateInvitationTemplateSchema,
} from "./index";

describe("Stage 5 API contracts", () => {
  it("accepts a one-to-one import mapping and rejects reused columns", () => {
    expect(
      importColumnMappingSchema.parse({
        displayName: "Guest name",
        phoneNumber: "Mobile",
        members: "Family members",
      }),
    ).toEqual({
      displayName: "Guest name",
      phoneNumber: "Mobile",
      members: "Family members",
    });
    expect(
      importColumnMappingSchema.safeParse({
        displayName: "Name",
        contactName: "Name",
        phoneNumber: "Phone",
      }).success,
    ).toBe(false);
  });

  it("requires explicit concurrency and duplicate decisions", () => {
    expect(
      confirmImportSchema.safeParse({
        duplicatePolicy: "SKIP",
        expectedVersion: 2,
      }).success,
    ).toBe(true);
    expect(
      confirmImportSchema.safeParse({ duplicatePolicy: "AUTO" }).success,
    ).toBe(false);
    expect(
      updateImportRowSchema.safeParse({
        corrections: {},
        expectedJobVersion: 1,
      }).success,
    ).toBe(false);
  });

  it("bounds template content and requires optimistic template updates", () => {
    expect(
      createInvitationTemplateSchema.safeParse({
        name: "Formal Arabic",
        locale: "ar-SA",
        body: "مرحبًا {{guest_name}}، ندعوكم إلى {{event_name}}.",
      }).success,
    ).toBe(true);
    expect(
      updateInvitationTemplateSchema.safeParse({ expectedVersion: 1 }).success,
    ).toBe(false);
  });

  it("supports atomic snapshot preparation for all or an explicit bounded set", () => {
    const templateId = "88d5cedc-e5a9-4bb4-91eb-32708aa55f9c";
    expect(createPreparationSnapshotsSchema.parse({ templateId })).toEqual({
      templateId,
    });
    expect(
      createPreparationSnapshotsSchema.safeParse({
        templateId,
        invitationIds: [],
      }).success,
    ).toBe(false);
  });

  it("accepts the full companion reply range allowed by invitation contracts", () => {
    expect(
      invitationPreviewSchema.safeParse({
        templateId: "88d5cedc-e5a9-4bb4-91eb-32708aa55f9c",
        templateVersion: 1,
        locale: "en",
        invitationType: "PRIMARY_WITH_COMPANIONS",
        renderedBody: "Welcome",
        renderedExtraMessage: null,
        scopeDescription: "This invitation includes companions.",
        replyActions: Array.from(
          { length: 102 },
          (_, index) => `Choice ${index}`,
        ),
        variables: {},
        assetId: null,
      }).success,
    ).toBe(true);
  });
});
