import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import {
  createLogger,
  createNoopErrorReporter,
  createPlatformMetrics,
  createRequestId,
  getRequestContext,
  normalizeRouteTemplate,
  redactedPlaceholder,
  runWithRequestContext,
  type ErrorReporter,
  type Logger,
  type PlatformMetrics,
} from "@dawah/observability";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { instrumentProcessor } from "../../../worker/src/observability";
import { CheckInsService } from "../../src/check-ins/check-ins.service";
import { EventAccessService } from "../../src/events/event-access.service";
import { EventsService } from "../../src/events/events.service";
import { InvitationsService } from "../../src/invitations/invitations.service";
import type { MessagingQueueService } from "../../src/messaging/messaging-queue.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ReportsService } from "../../src/reports/reports.service";
import { RsvpService } from "../../src/rsvp/rsvp.service";
import { TestDatabase } from "./database";
import {
  createEventFixture,
  createUserFixture,
  resetFactorySequence,
} from "./factories";

const database = new TestDatabase();
const prisma = database.prisma;
const prismaService = prisma as unknown as PrismaService;
const access = new EventAccessService(prismaService);

/**
 * Personal data deliberately planted in the fixtures. Nothing in this list may
 * appear in a log line, a metric series, or an error report, whichever code
 * path produced it.
 */
const guestName = "سارة الفهد";
const guestPhone = "+966501234567";
const hostEmail = "stage10-host@example.test";
const secondGuestName = "Ahmed Al-Qahtani";

interface DiagnosticsHarness {
  readonly lines: Record<string, unknown>[];
  readonly reports: unknown[];
  readonly metrics: PlatformMetrics;
  readonly errorReporter: ErrorReporter;
  readonly logger: Logger;
  /** Everything the deployment would ship off-host, as one string. */
  diagnosticsText(): string;
}

function diagnostics(): DiagnosticsHarness {
  const lines: Record<string, unknown>[] = [];
  const reports: unknown[] = [];
  const logger = createLogger({
    service: "api",
    environment: "test",
    level: "debug",
    write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  });
  const metrics = createPlatformMetrics();
  const errorReporter: ErrorReporter = {
    ...createNoopErrorReporter(),
    enabled: true,
    captureException: (error, context) => reports.push({ error, context }),
  };

  return {
    lines,
    reports,
    metrics,
    errorReporter,
    logger,
    diagnosticsText: () =>
      [
        JSON.stringify(lines),
        JSON.stringify(reports, errorReplacer),
        metrics.registry.render(),
      ].join("\n"),
  };
}

/** Errors do not survive JSON.stringify without help. */
function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

describe("Stage 10 production diagnostics and operational-surface integration", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await database.clean();
    resetFactorySequence();
  });

  afterAll(async () => {
    await database.clean();
    await prisma.$disconnect();
  });

  it("keeps guest identity out of every diagnostic a real host workflow produces", async () => {
    const harness = diagnostics();
    const { logger } = harness;
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage10-diagnostics-owner",
      email: hostEmail,
      phoneE164: guestPhone,
    });
    const event = await createEventFixture(prisma, owner);
    const principal = { subject: owner.authProviderId };

    const requestId = createRequestId();
    await runWithRequestContext(
      {
        requestId,
        correlationId: requestId,
        route: "/api/v1/events/:id/invitations",
      },
      async () => {
        const invitations = new InvitationsService(prismaService, access);
        // The real creation path, with real personal data in the payload.
        const created = await invitations.create(principal, event.id, {
          invitationType: "NAMED_GROUP",
          displayName: `${guestName} و ${secondGuestName}`,
          contactName: guestName,
          phoneNumber: guestPhone,
          phoneCountry: "SA",
          maxCompanions: 0,
          duplicateOverride: false,
          members: [
            { name: guestName, isPrimary: true },
            { name: secondGuestName, isPrimary: false },
          ],
        });

        logger.info("invitations.created", {
          eventId: event.id,
          invitationId: created.id,
          // A caller passing personal data by mistake is the case redaction
          // exists for; it must not defeat the guarantee.
          contactName: created.contactName,
          phoneE164: guestPhone,
          members: created.members,
        });

        const rsvp = rsvpService(harness.metrics);
        await rsvp.submitHost(principal, event.id, created.id, {
          submissionId: randomUUID(),
          attendingMemberIds: created.members.map((member) => member.id),
          companionCount: 0,
        });
        logger.info("rsvp.recorded", {
          eventId: event.id,
          invitationId: created.id,
        });

        const report = await new ReportsService(prismaService, access).get(
          principal,
          event.id,
        );
        logger.info("reports.generated", {
          eventId: event.id,
          expectedAttendance: report.expectedAttendance,
        });

        harness.metrics.httpRequests.increment({
          method: "POST",
          route: "/api/v1/events/:id/invitations",
          status: 201,
        });
      },
    );

    const text = harness.diagnosticsText();
    for (const secret of [
      guestName,
      secondGuestName,
      guestPhone,
      hostEmail,
      "0501234567",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain(redactedPlaceholder);

    // The trail is still usable: internal identifiers survive redaction.
    expect(text).toContain(event.id);
    expect(text).toContain(requestId);
    expect(harness.lines.every((line) => line.requestId === requestId)).toBe(
      true,
    );
  });

  it("keeps an invitation capability and its derived entry pass out of diagnostics", async () => {
    const harness = diagnostics();
    const { logger } = harness;
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage10-capability-owner",
    });
    const event = await createEventFixture(prisma, owner);
    await prisma.event.update({
      where: { id: event.id },
      data: { qrEnabled: true, status: "EVENT_DAY" },
    });
    const invitation = await createInvitation(event.id, owner.id, 11, [
      guestName,
    ]);
    await respond(
      { subject: owner.authProviderId },
      event.id,
      invitation,
      harness.metrics,
    );

    const capabilityToken = randomBytes(32).toString("base64url");
    await prisma.publicInvitationCapability.create({
      data: {
        invitationGroupId: invitation.id,
        tokenHash: createHash("sha256")
          .update(capabilityToken, "utf8")
          .digest("hex"),
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });

    const checkIns = new CheckInsService(
      prismaService,
      access,
      checkInConfig(),
      harness.metrics,
    );
    const pass = await checkIns.issuePublicEntryPass(capabilityToken);

    const requestId = createRequestId();
    runWithRequestContext(
      { requestId, correlationId: requestId, route: "/api/v1/i/:token" },
      () => {
        // Both a capability and a signed pass, logged the way a careless call
        // site would log them.
        logger.info("rsvp.capability_opened", {
          eventId: event.id,
          capabilityToken,
          entryPassToken: pass.token,
          qrPayload: pass.qrPayload,
          url: `https://dawah.sa/i/${capabilityToken}?signature=abcdef0123456789`,
        });
      },
    );

    const text = harness.diagnosticsText();
    expect(text).not.toContain(capabilityToken);
    expect(text).not.toContain(pass.token);
    expect(text).not.toContain("abcdef0123456789");
    expect(text).toContain(redactedPlaceholder);
  });

  it("redacts a genuine cross-event denial without losing its correlation trail", async () => {
    const harness = diagnostics();
    const { logger } = harness;
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage10-owner",
      email: hostEmail,
    });
    const intruder = await createUserFixture(prisma, {
      authProviderId: "stage10-intruder",
      email: "stage10-intruder@example.test",
    });
    const event = await createEventFixture(prisma, owner);
    await createInvitation(event.id, owner.id, 12, [guestName]);

    const requestId = createRequestId();
    await runWithRequestContext(
      { requestId, correlationId: requestId, route: "/api/v1/events/:id" },
      async () => {
        const events = new EventsService(prismaService, access);
        // User A asking for user B's event: the threat-model scenario, through
        // the real authorization path.
        const denial = await events
          .get({ subject: intruder.authProviderId }, event.id)
          .catch((error: unknown) => error);

        expect(denial).toBeInstanceOf(Error);
        logger.warn("http.request_rejected", {
          statusCode: 404,
          eventId: event.id,
          actorId: intruder.id,
          error: denial,
        });
        harness.errorReporter.captureException(denial as Error, {
          transaction: "GET /api/v1/events/:id",
        });
        harness.metrics.httpErrors.increment({
          method: "GET",
          route: "/api/v1/events/:id",
          kind: "client",
        });
      },
    );

    const text = harness.diagnosticsText();
    expect(text).not.toContain(guestName);
    expect(text).not.toContain(hostEmail);
    expect(text).not.toContain("stage10-intruder@example.test");
    expect(harness.lines[0]).toMatchObject({
      requestId,
      eventId: event.id,
      actorId: intruder.id,
      statusCode: 404,
    });
  });

  it("never lets personal data reach a metric label, even under load", async () => {
    const harness = diagnostics();
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage10-metrics-owner",
    });
    const event = await createEventFixture(prisma, owner);

    // One realistic scrape's worth of traffic, including the routes that carry
    // identifiers and opaque capabilities in their paths.
    for (let index = 0; index < 40; index += 1) {
      harness.metrics.httpRequests.increment({
        method: "GET",
        route: normalizeRouteTemplate(
          `/api/v1/events/${event.id}/invitations?search=${encodeURIComponent(guestName)}`,
        ),
        status: 200,
      });
      harness.metrics.httpRequests.increment({
        method: "GET",
        route: normalizeRouteTemplate(
          `/api/v1/i/${randomBytes(32).toString("base64url")}`,
        ),
        status: 200,
      });
    }

    const rendered = harness.metrics.registry.render();
    expect(rendered).not.toContain(guestName);
    expect(rendered).not.toContain(encodeURIComponent(guestName));
    expect(rendered).toContain('route="/api/v1/events/:id/invitations"');
    expect(rendered).toContain('route="/api/v1/i/:token"');

    // Forty distinct capability tokens must collapse into one series.
    const capabilitySeries = rendered
      .split("\n")
      .filter((line) => line.includes('route="/api/v1/i/:token"'));
    expect(capabilitySeries).toHaveLength(1);
  });

  it("carries one correlation identifier from a host request into the job it enqueues", async () => {
    const harness = diagnostics();
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage10-correlation-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const invitation = await createInvitation(event.id, owner.id, 13, [
      guestName,
    ]);

    const enqueued: { confirmationId: string; correlationId?: string }[] = [];
    const messagingQueue = {
      enqueueBatch: vi.fn().mockResolvedValue(undefined),
      enqueueRsvpConfirmation: vi.fn(async (confirmationId: string) => {
        // Mirrors MessagingQueueService, which stamps the active correlation
        // identifier onto the payload rather than the deterministic job id.
        enqueued.push({
          confirmationId,
          correlationId: getRequestContext()?.correlationId,
        });
      }),
    } as unknown as MessagingQueueService;

    const requestId = createRequestId();
    await runWithRequestContext(
      {
        requestId,
        correlationId: requestId,
        route: "/api/v1/events/:id/invitations/:id/rsvp",
      },
      async () => {
        await new RsvpService(
          prismaService,
          access,
          messagingQueue,
          rsvpConfig(),
          harness.metrics,
        ).submitHost(
          { subject: owner.authProviderId },
          event.id,
          invitation.id,
          {
            submissionId: randomUUID(),
            attendingMemberIds: invitation.members.map((member) => member.id),
            companionCount: 0,
          },
        );
      },
    );

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]?.correlationId).toBe(requestId);

    // The worker adopts the same identifier, so one value spans both processes.
    let workerCorrelationId: string | undefined;
    await instrumentProcessor({
      queue: "whatsapp-send",
      observability: {
        logger: harness.logger,
        metrics: harness.metrics,
        errorReporter: harness.errorReporter,
      },
      processor: async () => {
        workerCorrelationId = getRequestContext()?.correlationId;
        return "sent";
      },
    })({
      id: "message-1",
      name: "send-rsvp-confirmation",
      data: { correlationId: enqueued[0]?.correlationId, eventId: event.id },
      attemptsMade: 0,
      opts: { attempts: 5 },
    });

    expect(workerCorrelationId).toBe(requestId);
    expect(harness.metrics.registry.render()).toContain(
      'dawah_queue_jobs_total{queue="whatsapp-send",job="send-rsvp-confirmation",outcome="succeeded"} 1',
    );
  });

  it("counts the business outcomes the pilot review reconciles", async () => {
    const harness = diagnostics();
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage10-outcome-owner",
    });
    const event = await createEventFixture(prisma, owner);
    await prisma.event.update({
      where: { id: event.id },
      data: { qrEnabled: true, status: "EVENT_DAY" },
    });
    const invitation = await createInvitation(event.id, owner.id, 14, [
      guestName,
    ]);
    await respond(
      { subject: owner.authProviderId },
      event.id,
      invitation,
      harness.metrics,
    );

    const checkIns = new CheckInsService(
      prismaService,
      access,
      checkInConfig(),
      harness.metrics,
    );
    const arrival = {
      invitationGroupId: invitation.id,
      attendeeCount: 1,
      source: "QR" as const,
      deviceId: "scanner-1",
    };
    await checkIns.checkIn(
      { subject: owner.authProviderId },
      event.id,
      randomUUID(),
      arrival,
    );
    // A second scan of the same party must be visible as a duplicate, not as
    // additional attendance.
    await checkIns.checkIn(
      { subject: owner.authProviderId },
      event.id,
      randomUUID(),
      arrival,
    );

    const rendered = harness.metrics.registry.render();
    expect(rendered).toContain(
      'dawah_domain_events_total{kind="rsvp_submission",outcome="host"} 1',
    );
    expect(rendered).toContain(
      'dawah_domain_events_total{kind="check_in",outcome="already_checked_in"} 1',
    );
    expect(rendered).not.toContain(guestName);

    const state = await prisma.checkInState.findFirstOrThrow({
      where: { invitationGroupId: invitation.id },
    });
    expect(state.checkedInCount).toBe(1);
  });
});

function checkInConfig(): ConfigService<ApiEnvironment, true> {
  return {
    get: vi.fn((key: string) =>
      key === "CHECK_IN_ENABLED"
        ? true
        : "stage10-check-in-token-signing-secret-value",
    ),
  } as unknown as ConfigService<ApiEnvironment, true>;
}

function rsvpConfig(): ConfigService<ApiEnvironment, true> {
  return {
    get: (key: string) =>
      key.endsWith("_AR")
        ? "dawah_rsvp_confirmation_ar"
        : "dawah_rsvp_confirmation_en",
  } as unknown as ConfigService<ApiEnvironment, true>;
}

function rsvpService(metrics: PlatformMetrics): RsvpService {
  return new RsvpService(
    prismaService,
    access,
    {
      enqueueBatch: vi.fn().mockResolvedValue(undefined),
      enqueueRsvpConfirmation: vi.fn().mockResolvedValue(undefined),
    } as unknown as MessagingQueueService,
    rsvpConfig(),
    metrics,
  );
}

async function createInvitation(
  eventId: string,
  ownerId: string,
  phoneOffset: number,
  memberNames: readonly string[],
) {
  return prisma.invitationGroup.create({
    data: {
      eventId,
      displayName: memberNames.join(" and "),
      contactName: memberNames[0]!,
      phoneE164: `+9665666666${String(phoneOffset).padStart(2, "0")}`,
      phoneCountry: "SA",
      invitationType: memberNames.length === 1 ? "SINGLE" : "NAMED_GROUP",
      maxCompanions: 0,
      createdBy: ownerId,
      members: {
        create: memberNames.map((name, index) => ({
          name,
          position: index + 1,
          isPrimary: index === 0,
        })),
      },
    },
    include: { members: { orderBy: { position: "asc" } } },
  });
}

async function respond(
  principal: { readonly subject: string },
  eventId: string,
  invitation: { readonly id: string; readonly members: { id: string }[] },
  metrics: PlatformMetrics,
) {
  return rsvpService(metrics).submitHost(principal, eventId, invitation.id, {
    submissionId: randomUUID(),
    attendingMemberIds: invitation.members.map((member) => member.id),
    companionCount: 0,
  });
}
