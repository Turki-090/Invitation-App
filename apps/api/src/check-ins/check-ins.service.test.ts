import type { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import {
  checkInRequestFingerprint,
  createEntryPassToken,
  hashCheckInIdempotencyKey,
  hashEntryPassToken,
  Permission,
} from "@dawah/domain";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/auth.types";
import type { EventAccessService } from "../events/event-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import { CheckInsService } from "./check-ins.service";

const principal: AuthPrincipal = { subject: "stage9-check-in" };
const eventId = "10000000-0000-4000-8000-000000000001";
const invitationGroupId = "20000000-0000-4000-8000-000000000001";
const entryPassId = "30000000-0000-4000-8000-000000000001";
const stateId = "40000000-0000-4000-8000-000000000001";
const recordId = "50000000-0000-4000-8000-000000000001";
const membershipId = "60000000-0000-4000-8000-000000000001";
const userId = "70000000-0000-4000-8000-000000000001";
const signingSecret = "stage9-check-in-token-signing-secret-value";
const idempotencyKey = "check-in-key-000001";
const now = new Date("2026-09-16T18:00:00.000Z");

describe("CheckInsService arrivals", () => {
  it("records a partial arrival without exceeding confirmed attendance", async () => {
    const prisma = prismaMock({ expectedAttendees: 4, checkedInCount: 1 });

    const result = await service(prisma).checkIn(
      principal,
      eventId,
      idempotencyKey,
      { attendeeCount: 2, invitationGroupId, source: "QR" },
    );

    expect(result).toMatchObject({
      outcome: "PARTIALLY_CHECKED_IN",
      previousCheckedInAttendance: 1,
      checkedInAttendance: 3,
      remainingAttendance: 1,
      incrementedBy: 2,
      idempotentReplay: false,
    });
    expect(prisma.checkInState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ checkedInCount: 3 }),
      }),
    );
  });

  it("completes a party whose last guests arrive", async () => {
    const prisma = prismaMock({ expectedAttendees: 2, checkedInCount: 1 });

    const result = await service(prisma).checkIn(
      principal,
      eventId,
      idempotencyKey,
      { attendeeCount: 1, invitationGroupId, source: "MANUAL" },
    );

    expect(result).toMatchObject({
      outcome: "CHECKED_IN",
      checkedInAttendance: 2,
      remainingAttendance: 0,
    });
  });

  it("reports a duplicate scan instead of adding attendance", async () => {
    const prisma = prismaMock({ expectedAttendees: 2, checkedInCount: 2 });

    const result = await service(prisma).checkIn(
      principal,
      eventId,
      idempotencyKey,
      { attendeeCount: 1, invitationGroupId, source: "QR" },
    );

    expect(result).toMatchObject({
      outcome: "ALREADY_CHECKED_IN",
      incrementedBy: 0,
      recordId: null,
    });
    expect(prisma.checkInState.update).not.toHaveBeenCalled();
    expect(prisma.checkInRecord.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "check_in.duplicate_attempt",
        }),
      }),
    );
  });

  it("rejects an arrival larger than the remaining attendance", async () => {
    const prisma = prismaMock({ expectedAttendees: 3, checkedInCount: 2 });

    await expect(
      service(prisma).checkIn(principal, eventId, idempotencyKey, {
        attendeeCount: 2,
        invitationGroupId,
        source: "MANUAL",
      }),
    ).rejects.toMatchObject({
      response: { code: "CHECK_IN_CAPACITY_EXCEEDED" },
    });
    expect(prisma.checkInRecord.create).not.toHaveBeenCalled();
  });

  it("replays the stored result for a repeated idempotency key", async () => {
    const stored = {
      outcome: "CHECKED_IN",
      invitationGroupId,
      displayName: "أسرة الشمري",
      confirmedAttendance: 2,
      previousCheckedInAttendance: 0,
      checkedInAttendance: 2,
      remainingAttendance: 0,
      incrementedBy: 2,
      checkedInAt: now.toISOString(),
      checkedInBy: "Host",
      deviceId: null,
      recordId,
      idempotentReplay: false,
    };
    const prisma = prismaMock({
      expectedAttendees: 2,
      checkedInCount: 0,
      idempotencyRecord: {
        id: "idempotency",
        requestHash: checkInRequestFingerprint({
          eventId,
          invitationGroupId,
          attendeeCount: 2,
          source: "QR",
          deviceId: undefined,
        }),
        status: "COMPLETED",
        responseBody: stored,
      },
    });

    const result = await service(prisma).checkIn(
      principal,
      eventId,
      idempotencyKey,
      { attendeeCount: 2, invitationGroupId, source: "QR" },
    );

    expect(result).toMatchObject({
      outcome: "CHECKED_IN",
      idempotentReplay: true,
      recordId,
    });
    expect(prisma.checkInRecord.create).not.toHaveBeenCalled();
  });

  it("refuses an idempotency key reused for a different arrival", async () => {
    const prisma = prismaMock({
      expectedAttendees: 2,
      checkedInCount: 0,
      idempotencyRecord: {
        id: "idempotency",
        requestHash: "a-different-request",
        status: "COMPLETED",
        responseBody: {},
      },
    });

    await expect(
      service(prisma).checkIn(principal, eventId, idempotencyKey, {
        attendeeCount: 1,
        invitationGroupId,
        source: "QR",
      }),
    ).rejects.toMatchObject({
      response: { code: "IDEMPOTENCY_KEY_REUSED" },
    });
  });

  it("refuses to check in an invitation that never confirmed attendance", async () => {
    const prisma = prismaMock({
      expectedAttendees: 2,
      checkedInCount: 0,
      rsvpStatus: "PENDING",
    });

    await expect(
      service(prisma).checkIn(principal, eventId, idempotencyKey, {
        attendeeCount: 1,
        invitationGroupId,
        source: "MANUAL",
      }),
    ).rejects.toMatchObject({
      response: { code: "CHECK_IN_NOT_ELIGIBLE" },
    });
  });

  it("requires event-day mode for arrivals", async () => {
    const prisma = prismaMock({ expectedAttendees: 2, checkedInCount: 0 });

    await expect(
      service(prisma, { eventStatus: "ACTIVE" }).checkIn(
        principal,
        eventId,
        idempotencyKey,
        { attendeeCount: 1, invitationGroupId, source: "QR" },
      ),
    ).rejects.toMatchObject({
      response: { code: "CHECK_IN_EVENT_NOT_ACTIVE" },
    });
  });

  it("refuses check-in while the feature flag is off", async () => {
    const prisma = prismaMock({ expectedAttendees: 2, checkedInCount: 0 });

    await expect(
      service(prisma, { checkInEnabled: false }).checkIn(
        principal,
        eventId,
        idempotencyKey,
        { attendeeCount: 1, invitationGroupId, source: "QR" },
      ),
    ).rejects.toMatchObject({
      response: { code: "CHECK_IN_FEATURE_DISABLED" },
    });
  });

  it("retries a contended transaction, including a raw serialization failure", async () => {
    const prisma = prismaMock({ expectedAttendees: 2, checkedInCount: 0 });
    const run = vi.mocked(prisma.$transaction);
    const original = run.getMockImplementation()!;
    run
      .mockImplementationOnce(() => Promise.reject(rawSerializationFailure()))
      .mockImplementationOnce((operation: unknown) =>
        (original as (value: unknown) => Promise<unknown>)(operation),
      );

    const result = await service(prisma).checkIn(
      principal,
      eventId,
      idempotencyKey,
      { attendeeCount: 1, invitationGroupId, source: "QR" },
    );

    expect(result.outcome).toBe("PARTIALLY_CHECKED_IN");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("answers a permanently contended party with a retryable conflict", async () => {
    const prisma = prismaMock({ expectedAttendees: 2, checkedInCount: 0 });
    vi.mocked(prisma.$transaction).mockImplementation(() =>
      Promise.reject(rawSerializationFailure()),
    );

    await expect(
      service(prisma).checkIn(principal, eventId, idempotencyKey, {
        attendeeCount: 1,
        invitationGroupId,
        source: "QR",
      }),
    ).rejects.toMatchObject({ response: { code: "CHECK_IN_CONTENDED" } });
  });

  it("stores the idempotency fingerprint of the accepted request", async () => {
    const prisma = prismaMock({ expectedAttendees: 2, checkedInCount: 0 });

    await service(prisma).checkIn(principal, eventId, idempotencyKey, {
      attendeeCount: 1,
      invitationGroupId,
      source: "QR",
    });

    expect(prisma.idempotencyRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          keyHash: hashCheckInIdempotencyKey(idempotencyKey),
          operation: "EVENT_CHECK_IN",
          status: "IN_PROGRESS",
        }),
      }),
    );
  });
});

describe("CheckInsService pass resolution and search", () => {
  it("resolves a valid pass to its party", async () => {
    const token = createEntryPassToken(entryPassId, signingSecret);
    const prisma = prismaMock({ expectedAttendees: 3, checkedInCount: 1 });

    const resolved = await service(prisma).resolveEntryPass(
      principal,
      eventId,
      token,
    );

    expect(resolved).toMatchObject({
      invitationGroupId,
      confirmedAttendance: 3,
      checkedInAttendance: 1,
      remainingAttendance: 2,
      status: "PARTIALLY_CHECKED_IN",
    });
  });

  it("hides a pass that was revoked", async () => {
    const token = createEntryPassToken(entryPassId, signingSecret);
    const prisma = prismaMock({
      expectedAttendees: 3,
      checkedInCount: 0,
      entryPassRevoked: true,
    });

    await expect(
      service(prisma).resolveEntryPass(principal, eventId, token),
    ).rejects.toMatchObject({ response: { code: "ENTRY_PASS_NOT_FOUND" } });
  });

  it("hides a pass signed with another secret", async () => {
    const foreignToken = createEntryPassToken(entryPassId, "a".repeat(48));
    const prisma = prismaMock({ expectedAttendees: 3, checkedInCount: 0 });

    await expect(
      service(prisma).resolveEntryPass(principal, eventId, foreignToken),
    ).rejects.toMatchObject({ response: { code: "ENTRY_PASS_NOT_FOUND" } });
    expect(prisma.entryPass.findFirst).not.toHaveBeenCalled();
  });

  it("masks phone numbers for staff without the phone capability", async () => {
    const prisma = prismaMock({ expectedAttendees: 2, checkedInCount: 0 });

    const response = await service(prisma, { canViewPhone: false }).search(
      principal,
      eventId,
      { limit: 20, query: "الشمري" },
    );

    expect(response.items[0]).toMatchObject({ phoneMasked: true });
    expect(response.items[0]?.phoneDisplay).not.toBe("+966500000001");
  });

  it("requires the check-in capability", async () => {
    const prisma = prismaMock({ expectedAttendees: 2, checkedInCount: 0 });
    const access = accessMock();

    await service(prisma, { access }).search(principal, eventId, {
      limit: 20,
      query: "Guest",
    });

    expect(access.resolve).toHaveBeenCalledWith(
      principal,
      eventId,
      Permission.CHECKIN_USE,
    );
  });
});

function service(
  prisma: PrismaService,
  options: {
    access?: EventAccessService;
    canViewPhone?: boolean;
    checkInEnabled?: boolean;
    eventStatus?: string;
  } = {},
): CheckInsService {
  return new CheckInsService(
    prisma,
    options.access ??
      accessMock({
        canViewPhone: options.canViewPhone,
        eventStatus: options.eventStatus,
      }),
    configMock(options.checkInEnabled ?? true),
  );
}

function accessMock(
  options: { canViewPhone?: boolean; eventStatus?: string } = {},
): EventAccessService {
  return {
    resolve: vi.fn().mockResolvedValue({
      event: {
        id: eventId,
        archivedAt: null,
        qrEnabled: true,
        status: options.eventStatus ?? "EVENT_DAY",
      },
      membership: { id: membershipId, role: "CHECK_IN_STAFF" },
      user: { id: userId, displayName: "Host", email: null },
    }),
    allows: vi.fn().mockReturnValue(options.canViewPhone ?? true),
  } as unknown as EventAccessService;
}

function configMock(
  checkInEnabled: boolean,
): ConfigService<ApiEnvironment, true> {
  return {
    get: vi.fn((key: string) =>
      key === "CHECK_IN_ENABLED" ? checkInEnabled : signingSecret,
    ),
  } as unknown as ConfigService<ApiEnvironment, true>;
}

interface CheckInFixture {
  expectedAttendees: number;
  checkedInCount: number;
  entryPassRevoked?: boolean;
  idempotencyRecord?: unknown;
  rsvpStatus?: string;
}

function prismaMock(fixture: CheckInFixture): PrismaService & {
  auditLog: { create: ReturnType<typeof vi.fn> };
  checkInRecord: { create: ReturnType<typeof vi.fn> };
  checkInState: { update: ReturnType<typeof vi.fn> };
  entryPass: { findFirst: ReturnType<typeof vi.fn> };
  idempotencyRecord: { create: ReturnType<typeof vi.fn> };
} {
  const invitation = {
    id: invitationGroupId,
    eventId,
    displayName: "أسرة الشمري",
    phoneE164: "+966500000001",
    rsvpStatus: fixture.rsvpStatus ?? "ACCEPTED",
    expectedAttendees: fixture.expectedAttendees,
    cancelledAt: null,
    checkInState: {
      id: stateId,
      eventId,
      invitationGroupId,
      checkedInCount: fixture.checkedInCount,
      version: 1,
      firstCheckedInAt: fixture.checkedInCount > 0 ? now : null,
      lastCheckedInAt: fixture.checkedInCount > 0 ? now : null,
      lastCheckedInByUserId: fixture.checkedInCount > 0 ? userId : null,
      lastDeviceId: null,
      lastCheckedInByUser:
        fixture.checkedInCount > 0
          ? { displayName: "Host", email: null }
          : null,
    },
  };
  const token = createEntryPassToken(entryPassId, signingSecret);
  const client = {
    invitationGroup: {
      findFirst: vi.fn().mockResolvedValue(invitation),
      findMany: vi.fn().mockResolvedValue([invitation]),
    },
    entryPass: {
      findFirst: vi.fn().mockResolvedValue({
        id: entryPassId,
        eventId,
        invitationGroupId,
        tokenHash: hashEntryPassToken(token),
        expiresAt: null,
        revokedAt: fixture.entryPassRevoked ? now : null,
        invitationGroup: invitation,
      }),
    },
    checkInState: {
      create: vi.fn().mockResolvedValue(invitation.checkInState),
      update: vi.fn().mockResolvedValue({
        ...invitation.checkInState,
        checkedInCount: fixture.checkedInCount,
      }),
    },
    checkInRecord: {
      create: vi.fn().mockResolvedValue({
        id: recordId,
        createdAt: now,
        deviceId: null,
      }),
    },
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(fixture.idempotencyRecord ?? null),
      create: vi.fn().mockResolvedValue({ id: "idempotency" }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: invitationGroupId }]),
  };
  return {
    ...client,
    $transaction: vi.fn((run: (transaction: unknown) => Promise<unknown>) =>
      run(client),
    ),
  } as unknown as PrismaService & {
    auditLog: { create: ReturnType<typeof vi.fn> };
    checkInRecord: { create: ReturnType<typeof vi.fn> };
    checkInState: { update: ReturnType<typeof vi.fn> };
    entryPass: { findFirst: ReturnType<typeof vi.fn> };
    idempotencyRecord: { create: ReturnType<typeof vi.fn> };
  };
}

/** What Prisma raises when a raw `SELECT ... FOR UPDATE` loses a race. */
function rawSerializationFailure(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Raw query failed.", {
    clientVersion: "6.19.3",
    code: "P2010",
    meta: {
      code: "40001",
      message: "could not serialize access due to read/write dependencies",
    },
  });
}
