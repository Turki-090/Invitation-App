import { NotFoundException } from "@nestjs/common";
import { InvitationContentLocale, Permission } from "@dawah/domain";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/auth.types";
import type { EventAccessService } from "../events/event-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import { PreparationService } from "./preparation.service";

const eventId = "10000000-0000-4000-8000-000000000001";
const templateId = "20000000-0000-4000-8000-000000000001";
const nextTemplateId = "20000000-0000-4000-8000-000000000002";
const invitationId = "30000000-0000-4000-8000-000000000001";
const userId = "40000000-0000-4000-8000-000000000001";
const principal: AuthPrincipal = { subject: "stage-5-preparation-host" };
const now = new Date("2026-09-08T12:00:00.000Z");

describe("PreparationService", () => {
  it("creates a draft template with a canonical variable list and audit", async () => {
    const created = template({
      bodyTemplate: "Dear {{guest_name}}, join {{event_name}} at {{venue}}.",
      variableSchema: ["guest_name", "event_name", "venue"],
    });
    const create = vi.fn().mockResolvedValue(created);
    const audit = vi.fn().mockResolvedValue({});
    const transaction = {
      invitationTemplate: { create },
      auditLog: { create: audit },
    };
    const prisma = prismaMock({
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const access = accessMock();
    const service = new PreparationService(prisma, access);

    const result = await service.createTemplate(principal, eventId, {
      name: "English invitation",
      locale: InvitationContentLocale.EN,
      body: "Dear {{guest_name}}, join {{event_name}} at {{venue}}.",
    });

    expect(access.resolve).toHaveBeenCalledWith(
      principal,
      eventId,
      Permission.INVITATION_SEND,
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId,
        locale: "en",
        version: 1,
        variableSchema: ["guest_name", "event_name", "venue"],
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      include: { asset: true },
    });
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "invitation_template.created",
        metadata: expect.objectContaining({
          version: 1,
          variableKeys: ["guest_name", "event_name", "venue"],
        }),
      }),
    });
    expect(result).toMatchObject({
      status: "DRAFT",
      version: 1,
      variableKeys: ["guest_name", "event_name", "venue"],
    });
  });

  it("updates by creating a new version and leaves the approved source immutable", async () => {
    const existing = template({ status: "APPROVED", approvedAt: now });
    const next = template({
      id: nextTemplateId,
      version: 2,
      status: "DRAFT",
      displayName: "Revised invitation",
      bodyTemplate: "Welcome {{guest_name}} to {{event_name}}.",
      approvedAt: null,
    });
    const findFirst = vi.fn().mockResolvedValue(existing);
    const create = vi.fn().mockResolvedValue(next);
    const archiveOld = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      invitationTemplate: {
        findFirst,
        findFirstOrThrow: vi
          .fn()
          .mockResolvedValue({ id: existing.id, version: existing.version }),
        update: archiveOld,
        create,
      },
      storedAsset: { findFirst: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = prismaMock({
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const service = new PreparationService(prisma, accessMock());

    const result = await service.updateTemplate(
      principal,
      eventId,
      templateId,
      {
        name: "Revised invitation",
        body: "Welcome {{guest_name}} to {{event_name}}.",
        expectedVersion: 1,
      },
    );

    expect(archiveOld).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateKey: existing.templateKey,
        version: 2,
        displayName: "Revised invitation",
      }),
      include: { asset: true },
    });
    expect(result).toMatchObject({
      id: nextTemplateId,
      version: 2,
      status: "DRAFT",
    });
  });

  it("rejects branching from a non-latest template version", async () => {
    const existing = template({ status: "APPROVED", approvedAt: now });
    const create = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      invitationTemplate: {
        findFirst: vi.fn().mockResolvedValue(existing),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: nextTemplateId,
          version: 2,
        }),
        create,
      },
    };
    const prisma = prismaMock({
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const service = new PreparationService(prisma, accessMock());

    await expect(
      service.updateTemplate(principal, eventId, templateId, {
        name: "Branch attempt",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      response: { code: "TEMPLATE_VERSION_NOT_LATEST" },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("approves under a locale-scoped lock and assigns the first default", async () => {
    const draft = template();
    const approved = template({
      status: "APPROVED",
      approvedAt: now,
      isDefault: true,
    });
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(approved);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const audit = vi.fn().mockResolvedValue({});
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      invitationTemplate: {
        findFirst,
        count: vi.fn().mockResolvedValue(0),
        updateMany,
      },
      auditLog: { create: audit },
    };
    const prisma = prismaMock({
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const service = new PreparationService(prisma, accessMock());

    const result = await service.approveTemplate(
      principal,
      eventId,
      templateId,
      { expectedVersion: 1 },
    );

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: templateId,
        eventId,
        version: 1,
        status: "DRAFT",
      },
      data: {
        status: "APPROVED",
        approvedAt: expect.any(Date),
        isDefault: true,
      },
    });
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "invitation_template.approved" }),
    });
    expect(result.status).toBe("APPROVED");
  });

  it("renders a concrete WhatsApp-style preview without persisting a snapshot", async () => {
    const approved = template({
      status: "APPROVED",
      approvedAt: now,
      bodyTemplate:
        "Dear {{guest_name}}, {{event_name}} is at {{venue}} on {{event_date}}.",
      variableSchema: ["guest_name", "event_name", "venue", "event_date"],
    });
    const invitation = invitationFixture();
    const prisma = prismaMock({
      invitationTemplate: { findFirst: vi.fn().mockResolvedValue(approved) },
      invitationGroup: { findFirst: vi.fn().mockResolvedValue(invitation) },
    });
    const service = new PreparationService(prisma, accessMock());

    const result = await service.preview(principal, eventId, {
      templateId,
      invitationType: "SINGLE",
      invitationId,
    });

    expect(result.renderedBody).toContain("Sarah Al-Qahtani");
    expect(result.renderedBody).toContain("Wedding of Noura and Omar");
    expect(result.renderedBody).toContain("Test Hall");
    expect(result.scopeDescription).toBe("This invitation is for you.");
    expect(result.replyActions).toEqual(["I will attend", "Decline"]);
    expect(result.variables).toMatchObject({
      guest_name: "Sarah Al-Qahtani",
      event_name: "Wedding of Noura and Omar",
      venue: "Test Hall",
    });
    expect(prisma.invitationContentSnapshot.findMany).not.toHaveBeenCalled();
  });

  it("returns actionable readiness details instead of failing an invalid preview", async () => {
    const approved = template({ status: "APPROVED", approvedAt: now });
    const invitation = invitationFixture({ cancelledAt: now });
    const prisma = prismaMock({
      invitationTemplate: { findFirst: vi.fn().mockResolvedValue(approved) },
      invitationGroup: { findFirst: vi.fn().mockResolvedValue(invitation) },
    });
    const service = new PreparationService(prisma, accessMock());

    await expect(
      service.preview(principal, eventId, {
        templateId,
        invitationType: "SINGLE",
        invitationId,
      }),
    ).rejects.toMatchObject({
      response: {
        code: "PREVIEW_NOT_READY",
        details: {
          issues: [expect.objectContaining({ code: "INVITATION_CANCELLED" })],
        },
      },
    });
  });

  it("reports server-derived readiness and blocks an invalid contact", async () => {
    const approved = template({ status: "APPROVED", approvedAt: now });
    const valid = invitationFixture();
    const invalid = invitationFixture({
      id: "30000000-0000-4000-8000-000000000002",
      phoneE164: "0501234567",
    });
    const prisma = prismaMock({
      invitationTemplate: { findFirst: vi.fn().mockResolvedValue(approved) },
      invitationGroup: {
        findMany: vi.fn().mockResolvedValue([valid, invalid]),
      },
      invitationContentSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const service = new PreparationService(prisma, accessMock());

    const result = await service.readiness(principal, eventId, {
      templateId,
      page: 1,
      pageSize: 50,
    });

    expect(result.summary).toEqual({
      totalInvitations: 2,
      readyInvitations: 1,
      blockedInvitations: 1,
      snapshottedInvitations: 0,
    });
    expect(result.items[0]).toMatchObject({
      invitationId: valid.id,
      ready: true,
      issues: [],
    });
    expect(result.items[1]).toMatchObject({
      invitationId: invalid.id,
      ready: false,
      issues: [
        expect.objectContaining({ code: "INVITATION_PHONE_NOT_NORMALIZED" }),
      ],
    });
  });

  it("reuses an identical snapshot and preserves old content when live source data changes", async () => {
    const currentEvent = eventFixture();
    const approved = template({
      status: "APPROVED",
      approvedAt: now,
      bodyTemplate: "Dear {{guest_name}}, welcome to {{event_name}}.",
      variableSchema: ["guest_name", "event_name"],
    });
    const invitation = invitationFixture();
    const storedSnapshots: Array<Record<string, unknown>> = [];
    const snapshotRepository = {
      findMany: vi.fn().mockImplementation(({ where, select }) => {
        const pairs = (where.OR ?? []) as Array<{
          invitationGroupId: string;
          sourceHash: string;
        }>;
        const matches = storedSnapshots.filter((snapshot) =>
          pairs.some(
            (pair) =>
              pair.invitationGroupId === snapshot.invitationGroupId &&
              pair.sourceHash === snapshot.sourceHash,
          ),
        );
        return Promise.resolve(
          matches.map((snapshot) =>
            Object.fromEntries(
              Object.keys(select).map((key) => [key, snapshot[key]]),
            ),
          ),
        );
      }),
      createMany: vi.fn().mockImplementation(({ data }) => {
        storedSnapshots.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: {
        findUniqueOrThrow: vi.fn().mockImplementation(() => currentEvent),
      },
      invitationTemplate: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(approved)),
      },
      invitationGroup: {
        findMany: vi.fn().mockImplementation(() => [invitation]),
      },
      invitationContentSnapshot: snapshotRepository,
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = prismaMock({
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const service = new PreparationService(prisma, accessMock());

    const first = await service.createSnapshots(principal, eventId, {
      templateId,
      invitationIds: [invitationId],
    });
    const immutableFirst = structuredClone(storedSnapshots[0]);
    const repeated = await service.createSnapshots(principal, eventId, {
      templateId,
      invitationIds: [invitationId],
    });

    expect(first).toMatchObject({ createdCount: 1, reusedCount: 0 });
    expect(repeated).toMatchObject({ createdCount: 0, reusedCount: 1 });
    expect(repeated.snapshotIds).toEqual(first.snapshotIds);
    expect(storedSnapshots).toHaveLength(1);

    invitation.displayName = "Sarah Updated";
    const changed = await service.createSnapshots(principal, eventId, {
      templateId,
      invitationIds: [invitationId],
    });

    expect(changed).toMatchObject({ createdCount: 1, reusedCount: 0 });
    expect(storedSnapshots).toHaveLength(2);
    expect(storedSnapshots[0]).toEqual(immutableFirst);
    expect(storedSnapshots[1]?.renderedBody).toContain("Sarah Updated");
    expect(storedSnapshots[0]?.renderedBody).toContain("Sarah Al-Qahtani");
    expect(storedSnapshots[1]?.sourceHash).not.toBe(
      storedSnapshots[0]?.sourceHash,
    );
    expect(storedSnapshots[1]?.contentHash).not.toBe(
      storedSnapshots[0]?.contentHash,
    );
  });

  it("does not query templates when a foreign event is inaccessible", async () => {
    const access = accessMock();
    vi.mocked(access.resolve).mockRejectedValueOnce(
      new NotFoundException({
        code: "EVENT_NOT_FOUND",
        message: "The event does not exist or is not accessible.",
      }),
    );
    const prisma = prismaMock();
    const service = new PreparationService(prisma, access);

    await expect(
      service.listTemplates(principal, eventId),
    ).rejects.toMatchObject({ response: { code: "EVENT_NOT_FOUND" } });
    expect(prisma.invitationTemplate.findMany).not.toHaveBeenCalled();
  });
});

function accessMock(): EventAccessService {
  return {
    resolve: vi.fn().mockResolvedValue({
      event: eventFixture(),
      membership: { role: "OWNER", permissionsJson: [] },
      user: { id: userId },
    }),
  } as unknown as EventAccessService;
}

function prismaMock(overrides: Record<string, unknown> = {}): PrismaService {
  return {
    invitationTemplate: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      ...(overrides.invitationTemplate as object | undefined),
    },
    invitationGroup: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      ...(overrides.invitationGroup as object | undefined),
    },
    invitationContentSnapshot: {
      findMany: vi.fn(),
      ...(overrides.invitationContentSnapshot as object | undefined),
    },
    storedAsset: {
      findFirst: vi.fn(),
      ...(overrides.storedAsset as object | undefined),
    },
    $transaction: vi.fn(),
    ...overrides,
  } as unknown as PrismaService;
}

function eventFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: eventId,
    ownerUserId: userId,
    nameAr: "زفاف نورة وعمر",
    nameEn: "Wedding of Noura and Omar",
    eventType: "WEDDING",
    eventDate: new Date("2027-01-15T00:00:00.000Z"),
    startTime: new Date("1970-01-01T20:00:00.000Z"),
    endTime: null,
    timezone: "Asia/Riyadh",
    venueNameAr: "قاعة الاختبار",
    venueNameEn: "Test Hall",
    addressLine: null,
    city: "Riyadh",
    latitude: null,
    longitude: null,
    mapUrl: null,
    rsvpDeadline: null,
    allowRsvpEdits: true,
    qrEnabled: false,
    status: "DRAFT",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: templateId,
    eventId,
    assetId: null,
    createdBy: userId,
    templateKey: "default-invitation",
    version: 1,
    locale: "en",
    status: "DRAFT",
    displayName: "English invitation",
    provider: "META_WHATSAPP",
    providerTemplateName: null,
    bodyTemplate: "Dear {{guest_name}}, welcome to {{event_name}}.",
    extraMessageTemplate: null,
    variableSchema: ["guest_name", "event_name"],
    interactiveComponents: [],
    contentHash: "a".repeat(64),
    isDefault: false,
    approvedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    asset: null,
    ...overrides,
  };
}

function invitationFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: invitationId,
    eventId,
    displayName: "Sarah Al-Qahtani",
    contactName: "Sarah Al-Qahtani",
    phoneE164: "+966501234567",
    phoneCountry: "SA",
    invitationType: "SINGLE",
    maxCompanions: 0,
    internalNote: null,
    rsvpStatus: "PENDING",
    expectedAttendees: 0,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    cancelledAt: null,
    members: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        invitationGroupId: invitationId,
        name: "Sarah Al-Qahtani",
        position: 1,
        isPrimary: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  };
}
