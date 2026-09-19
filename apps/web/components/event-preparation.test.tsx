import "../test/setup";
import type {
  ConfirmImportResult,
  ImportJobDetailResponse,
  ImportJobSummary,
  ImportRow,
  InvitationPreview,
  InvitationTemplate,
  ReadinessResponse,
} from "@dawah/api-contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { EventPreparation } from "./event-preparation";

const eventId = "11111111-1111-4111-8111-111111111111";
const templateId = "22222222-2222-4222-8222-222222222222";
const importJobId = "33333333-3333-4333-8333-333333333333";
const importRowId = "44444444-4444-4444-8444-444444444444";
const invitationId = "55555555-5555-4555-8555-555555555555";
const snapshotId = "66666666-6666-4666-8666-666666666666";

const api = vi.hoisted(() => ({
  approveInvitationTemplate: vi.fn(),
  archiveInvitationTemplate: vi.fn(),
  cancelImportJob: vi.fn(),
  confirmImportJob: vi.fn(),
  createImportJob: vi.fn(),
  createInvitationTemplate: vi.fn(),
  createPreparationSnapshots: vi.fn(),
  getImportJob: vi.fn(),
  getImportLimits: vi.fn(),
  getPreparationReadiness: vi.fn(),
  listImportJobs: vi.fn(),
  listInvitationAssets: vi.fn(),
  listInvitationTemplates: vi.fn(),
  previewInvitation: vi.fn(),
  updateImportMapping: vi.fn(),
  updateImportRow: vi.fn(),
  updateInvitationTemplate: vi.fn(),
  uploadInvitationAsset: vi.fn(),
}));

vi.mock("../lib/api", () => api);

const template: InvitationTemplate = {
  approvedAt: "2026-09-08T00:05:00.000Z",
  archivedAt: null,
  assetChecksumSha256: null,
  assetId: null,
  body: "Hello {{guest_name}}, join us for {{event_name}}.",
  createdAt: "2026-09-08T00:00:00.000Z",
  eventId,
  extraMessage: "We look forward to seeing you.",
  id: templateId,
  locale: "en",
  name: "Formal invitation",
  purpose: "INVITATION",
  providerTemplateName: "wedding_invitation_en",
  status: "APPROVED",
  updatedAt: "2026-09-08T00:05:00.000Z",
  variableKeys: ["guest_name", "event_name"],
  version: 2,
};

const preview: InvitationPreview = {
  assetId: null,
  invitationType: "PRIMARY_WITH_COMPANIONS",
  locale: "en",
  renderedBody: "Hello Omar, join us for Khalid & Nora Wedding.",
  renderedExtraMessage: "We look forward to seeing you.",
  replyActions: ["I will attend", "I cannot attend"],
  scopeDescription: "This invitation includes Omar and up to 2 companions.",
  templateId,
  templateVersion: 2,
  variables: {
    allowed_companions: "2",
    event_name: "Khalid & Nora Wedding",
    guest_name: "Omar",
  },
};

const readiness: ReadinessResponse = {
  items: [
    {
      invitationId,
      issues: [],
      latestSnapshotId: null,
      ready: true,
      sourceHash: "a".repeat(64),
    },
  ],
  pagination: { page: 1, pageSize: 50, totalItems: 2, totalPages: 1 },
  summary: {
    blockedInvitations: 0,
    readyInvitations: 2,
    snapshottedInvitations: 0,
    totalInvitations: 2,
  },
  template,
};

const importJob: ImportJobSummary = {
  cancelledAt: null,
  completedAt: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  duplicateRows: 1,
  eventId,
  failureCode: null,
  failureMessage: null,
  fileSizeBytes: 1_024,
  id: importJobId,
  importedRows: 0,
  invalidRows: 0,
  mediaType: "text/csv",
  originalFilename: "guests.csv",
  skippedRows: 0,
  status: "READY",
  totalRows: 51,
  updatedAt: "2026-09-08T00:02:00.000Z",
  validRows: 50,
  version: 3,
  worksheetName: null,
};

const importRow: ImportRow = {
  correctedData: null,
  errors: [],
  id: importRowId,
  importedInvitationGroupId: null,
  normalizedData: {
    contactName: "Maha Al-Saud",
    displayName: "Al-Saud family",
    internalNote: null,
    invitationType: "NAMED_GROUP",
    maxCompanions: 0,
    members: [
      { isPrimary: false, name: "Maha Al-Saud" },
      { isPrimary: false, name: "Layan Al-Saud" },
    ],
    phoneCountry: "SA",
    phoneE164: "+966501234567",
  },
  rowNumber: 2,
  sourceData: {
    "Group name": "Al-Saud family",
    "WhatsApp number": "0501234567",
  },
  status: "DUPLICATE",
  updatedAt: "2026-09-08T00:02:00.000Z",
  warnings: [
    {
      code: "DUPLICATE_PHONE",
      duplicateInvitationIds: [invitationId],
      field: "phoneNumber",
      message: "This number already belongs to an invitation group.",
    },
  ],
};

function importDetail(
  job: ImportJobSummary = importJob,
): ImportJobDetailResponse {
  return {
    job: {
      ...job,
      columnMapping: {
        displayName: "Group name",
        phoneNumber: "WhatsApp number",
      },
      headers: ["Group name", "WhatsApp number"],
      suggestedMapping: {
        displayName: "Group name",
        phoneNumber: "WhatsApp number",
      },
    },
    pagination: { page: 1, pageSize: 50, totalItems: 51, totalPages: 2 },
    rows: [importRow],
  };
}

function renderPreparation() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: 0, retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventPreparation
        common={en.common}
        copy={en.preparation}
        eventId={eventId}
        locale="en"
        supabase={null}
      />
    </QueryClientProvider>,
  );
}

describe("event preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listInvitationTemplates.mockResolvedValue([template]);
    api.listInvitationAssets.mockResolvedValue({ items: [] });
    api.previewInvitation.mockResolvedValue(preview);
    api.getPreparationReadiness.mockResolvedValue(readiness);
    api.createPreparationSnapshots.mockResolvedValue({
      blockedCount: 0,
      blockedInvitationIds: [],
      createdCount: 2,
      reusedCount: 0,
      snapshotIds: [snapshotId],
      templateId,
    });
    api.getImportLimits.mockResolvedValue({
      acceptedExtensions: [".xlsx", ".csv"],
      maximumCellCharacters: 1_000,
      maximumColumns: 64,
      maximumFileBytes: 8 * 1_024 * 1_024,
      maximumRows: 5_000,
    });
    api.listImportJobs.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
    api.getImportJob.mockResolvedValue(importDetail());
    api.createImportJob.mockResolvedValue(importJob);
    api.updateImportMapping.mockResolvedValue(importJob);
    api.updateImportRow.mockResolvedValue(importRow);
    api.cancelImportJob.mockResolvedValue({
      ...importJob,
      cancelledAt: "2026-09-08T00:04:00.000Z",
      status: "CANCELLED",
    });
    api.confirmImportJob.mockResolvedValue({
      completedAt: "2026-09-08T00:04:00.000Z",
      duplicateRowsImported: 0,
      importJobId,
      importedRows: 50,
      invitationGroupIds: [invitationId],
      skippedRows: 1,
    } satisfies ConfirmImportResult);
  });

  it("shows the server WhatsApp preview and creates snapshots only from readiness", async () => {
    const user = userEvent.setup();
    renderPreparation();

    expect(await screen.findByText(preview.renderedBody)).toBeTruthy();
    expect(screen.getByText(preview.scopeDescription)).toBeTruthy();
    expect(screen.getByText("I will attend")).toBeTruthy();
    expect(screen.getByText(en.preparation.viewInvitation)).toBeTruthy();
    await waitFor(() =>
      expect(api.previewInvitation).toHaveBeenCalledWith(null, eventId, {
        invitationType: "PRIMARY_WITH_COMPANIONS",
        templateId,
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: new RegExp(`^${en.preparation.templateName}`),
      }),
      " updated",
    );
    expect(
      screen.getByText(en.preparation.unsavedTemplateChanges),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: en.preparation.createSnapshots })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(
      screen.getByRole("button", {
        name: en.preparation.discardTemplateChanges,
      }),
    );

    await user.click(
      screen.getByRole("tab", { name: en.preparation.singleInvitation }),
    );
    await waitFor(() =>
      expect(api.previewInvitation).toHaveBeenLastCalledWith(null, eventId, {
        invitationType: "SINGLE",
        templateId,
      }),
    );

    await user.click(
      screen.getByRole("button", { name: en.preparation.createSnapshots }),
    );
    await waitFor(() =>
      expect(api.createPreparationSnapshots).toHaveBeenCalledWith(
        null,
        eventId,
        { templateId },
      ),
    );
    expect(
      await screen.findByText("Prepared 2 invitation snapshots"),
    ).toBeTruthy();
  });

  it("uploads a private guest file, applies suggested columns, and starts validation", async () => {
    const awaitingMapping = {
      ...importJob,
      duplicateRows: 0,
      status: "AWAITING_MAPPING",
      totalRows: 1,
      validRows: 0,
      version: 1,
    } satisfies ImportJobSummary;
    api.createImportJob.mockResolvedValue(awaitingMapping);
    api.getImportJob.mockResolvedValue(importDetail(awaitingMapping));
    const user = userEvent.setup();
    renderPreparation();

    await user.click(
      screen.getByRole("tab", { name: en.preparation.importTab }),
    );
    const file = new File(
      ["Group name,WhatsApp number\nAl-Saud family,0501234567"],
      "guests.csv",
      { type: "text/csv" },
    );
    expect(
      screen
        .getByRole("link", { name: en.preparation.downloadExcelTemplate })
        .getAttribute("href"),
    ).toBe("/templates/guest-import.xlsx");
    expect(
      screen
        .getByRole("link", { name: en.preparation.downloadCsvTemplate })
        .hasAttribute("download"),
    ).toBe(true);
    await user.upload(
      await screen.findByLabelText(en.preparation.chooseFile),
      file,
    );

    await waitFor(() =>
      expect(api.createImportJob).toHaveBeenCalledWith(null, eventId, file),
    );
    expect(await screen.findByText(en.preparation.mappingTitle)).toBeTruthy();
    await waitFor(() => {
      const displayNameMapping = screen.getByRole("combobox", {
        name: new RegExp(`^${en.preparation.mappingFields.displayName}`),
      });
      const phoneMapping = screen.getByRole("combobox", {
        name: new RegExp(`^${en.preparation.mappingFields.phoneNumber}`),
      });
      expect((displayNameMapping as HTMLSelectElement).value).toBe(
        "Group name",
      );
      expect((phoneMapping as HTMLSelectElement).value).toBe("WhatsApp number");
    });

    await user.click(
      screen.getByRole("button", { name: en.preparation.validateRows }),
    );
    await waitFor(() =>
      expect(api.updateImportMapping).toHaveBeenCalledWith(
        null,
        eventId,
        importJobId,
        {
          expectedVersion: 1,
          mapping: {
            displayName: "Group name",
            phoneNumber: "WhatsApp number",
          },
        },
      ),
    );
  });

  it("filters and pages large reviews, audits a row correction, and confirms duplicates explicitly", async () => {
    api.listImportJobs.mockResolvedValue({
      items: [importJob],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    const user = userEvent.setup();
    renderPreparation();

    await user.click(
      screen.getByRole("tab", { name: en.preparation.importTab }),
    );
    expect(await screen.findByText(en.preparation.reviewTitle)).toBeTruthy();

    await user.selectOptions(
      screen.getByLabelText(en.preparation.rowStatusFilter),
      "DUPLICATE",
    );
    await waitFor(() =>
      expect(api.getImportJob).toHaveBeenLastCalledWith(
        null,
        eventId,
        importJobId,
        { page: 1, pageSize: 50, rowStatus: "DUPLICATE" },
      ),
    );
    await user.click(
      screen.getByRole("button", { name: en.preparation.nextRowsPage }),
    );
    await waitFor(() =>
      expect(api.getImportJob).toHaveBeenLastCalledWith(
        null,
        eventId,
        importJobId,
        { page: 2, pageSize: 50, rowStatus: "DUPLICATE" },
      ),
    );

    await user.click(
      screen.getAllByRole("button", {
        name: en.preparation.correctRow,
      })[0]!,
    );
    const drawer = await screen.findByRole("dialog", {
      name: "Correct row 2",
    });
    const phone = within(drawer).getByLabelText(
      en.preparation.mappingFields.phoneNumber,
    );
    await user.clear(phone);
    await user.type(phone, "+966551234567");
    await user.click(
      within(drawer).getByRole("button", {
        name: en.preparation.saveCorrection,
      }),
    );

    await waitFor(() =>
      expect(api.updateImportRow).toHaveBeenCalledWith(
        null,
        eventId,
        importJobId,
        importRowId,
        {
          corrections: {
            contactName: "Maha Al-Saud",
            displayName: "Al-Saud family",
            internalNote: null,
            invitationType: "NAMED_GROUP",
            maxCompanions: 0,
            members: "Maha Al-Saud | Layan Al-Saud",
            phoneCountry: "SA",
            phoneNumber: "+966551234567",
          },
          expectedJobVersion: 3,
        },
      ),
    );

    await user.click(
      screen.getByRole("button", { name: en.preparation.confirmImport }),
    );
    await waitFor(() =>
      expect(api.confirmImportJob).toHaveBeenCalledWith(
        null,
        eventId,
        importJobId,
        { duplicatePolicy: "SKIP", expectedVersion: 3 },
      ),
    );
  });
});
