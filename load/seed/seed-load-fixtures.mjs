// Seeds the Stage 9 load-test event: 20,000 invitation groups with named guest
// members, RSVP responses, prepared content snapshots, delivered invitation
// messages, partial check-in state, audit history and a credit ledger.
//
// The script writes only through Prisma, so every database invariant that
// protects the real application also protects the fixture: the deferred
// invitation-structure and RSVP-aggregate constraint triggers, the check-in
// capacity guard, the snapshot and message source triggers, and the
// non-negative credit guard all run exactly as they do in production.
//
// Run:
//   docker compose --profile test up -d --wait postgres-test
//   pnpm exec prisma migrate deploy --schema database/schema.prisma
//   node --env-file=.env.test.example --env-file-if-exists=.env.test \
//     load/seed/seed-load-fixtures.mjs

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const fixtures = JSON.parse(
  readFileSync(new URL("../fixtures.json", import.meta.url), "utf8"),
);

// ---------------------------------------------------------------------------
// Safety. Mirrors scripts/run-integration-tests.mjs: this script must never be
// able to reach a development, staging or production database.
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Copy .env.test.example to .env.test or provide CI test variables.",
  );
}

const databaseName = new URL(databaseUrl).pathname
  .replace(/^\//, "")
  .toLowerCase();
const databaseHostname = new URL(databaseUrl).hostname
  .toLowerCase()
  .replace(/^\[|\]$/g, "");
if (
  process.env.NODE_ENV !== "test" ||
  process.env.DAWAH_ENV !== "test" ||
  databaseName !== "dawah_test" ||
  !new Set(["localhost", "127.0.0.1", "::1"]).has(databaseHostname)
) {
  throw new Error(
    "Load fixtures may be seeded only into the local dawah_test database with NODE_ENV=test and DAWAH_ENV=test.",
  );
}

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

const TOTAL_GROUPS = positiveInteger(
  "LOAD_INVITATION_GROUPS",
  fixtures.invitationGroups,
);
const CHUNK_SIZE = positiveInteger("LOAD_CHUNK_SIZE", 500);
const CHECK_IN_TARGETS = fixtures.checkInTargets;
const CHECK_IN_TARGET_ATTENDEES = fixtures.checkInTargetAttendees;
const MESSAGED_GROUPS = fixtures.messagedGroups;
const SENDABLE_GROUPS = fixtures.sendableGroups;
const CHECKED_IN_GROUPS = fixtures.checkedInGroups;
const AUDIT_LOGS = fixtures.auditLogs;
const LEDGER_ENTRIES = fixtures.ledgerEntries;
const PURCHASED_UNITS = fixtures.purchasedCreditUnits;
const CANCELLED_EVERY = fixtures.cancelledEvery;

const BANDS = {
  checkIn: { start: 0, end: CHECK_IN_TARGETS },
  messaged: {
    start: CHECK_IN_TARGETS,
    end: CHECK_IN_TARGETS + MESSAGED_GROUPS,
  },
  sendable: {
    start: CHECK_IN_TARGETS + MESSAGED_GROUPS,
    end: CHECK_IN_TARGETS + MESSAGED_GROUPS + SENDABLE_GROUPS,
  },
};

if (TOTAL_GROUPS < BANDS.sendable.end) {
  throw new Error(
    `LOAD_INVITATION_GROUPS must be at least ${BANDS.sendable.end} so the check-in, messaged and sendable bands fit.`,
  );
}
if (LEDGER_ENTRIES > MESSAGED_GROUPS) {
  throw new Error(
    "The ledger cannot hold more entries than there are messages.",
  );
}

const CREATED_AT_BASE = Date.UTC(2026, 8, 1, 0, 0, 0);
const EVENT_DATE = new Date("2027-01-15T00:00:00.000Z");
const EVENT_START_TIME = new Date("1970-01-01T20:00:00.000Z");

const FAMILY_NAMES = [
  "الزهراني",
  "القحطاني",
  "الغامدي",
  "العتيبي",
  "الشهري",
  "الدوسري",
  "الحربي",
  "المالكي",
];
const GIVEN_NAMES = [
  "محمد",
  "عبدالله",
  "فاطمة",
  "نورة",
  "سارة",
  "خالد",
  "ريم",
  "يوسف",
];
const SENT_STATUSES = ["SENT", "DELIVERED", "READ", "RESPONDED"];
const UNSENT_STATUSES = ["QUEUED", "SENDING", "FAILED", "CANCELLED"];

// ---------------------------------------------------------------------------
// Deterministic identifiers, shared with the k6 scenarios through fixtures.json
// ---------------------------------------------------------------------------

function fixtureId(prefix, index) {
  return `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const id = {
  group: (index) => fixtureId(fixtures.idPrefixes.invitationGroup, index),
  member: (index, position) =>
    fixtureId(fixtures.idPrefixes.guestMember, index * 1000 + position),
  rsvp: (index) => fixtureId(fixtures.idPrefixes.rsvp, index),
  rsvpMember: (index, position) =>
    fixtureId(fixtures.idPrefixes.rsvpMember, index * 1000 + position),
  snapshot: (index) => fixtureId(fixtures.idPrefixes.snapshot, index),
  message: (index) => fixtureId(fixtures.idPrefixes.message, index),
  checkInState: (index) => fixtureId(fixtures.idPrefixes.checkInState, index),
  checkInRecord: (index) => fixtureId(fixtures.idPrefixes.checkInRecord, index),
  ledgerEntry: (index) =>
    fixtureId(fixtures.idPrefixes.creditLedgerEntry, index),
  auditLog: (index) => fixtureId(fixtures.idPrefixes.auditLog, index),
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Byte-stable object serialisation, copied from the API source-hash helper. */
function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

/**
 * Reproduces apps/api/src/preparation/invitation-source-hash.ts. A snapshot
 * whose source hash does not match what the API recomputes is treated as stale,
 * and the send-launch scenario would find nothing ready to send.
 */
function invitationSourceHash(event, invitation, template) {
  return sha256(
    stableSerialize({
      event: {
        id: event.id,
        nameAr: event.nameAr,
        nameEn: event.nameEn,
        date: event.eventDate.toISOString(),
        time: event.startTime.toISOString(),
        venueNameAr: event.venueNameAr,
        venueNameEn: event.venueNameEn,
        timezone: event.timezone,
      },
      invitation: {
        id: invitation.id,
        displayName: invitation.displayName,
        phoneE164: invitation.phoneE164,
        invitationType: invitation.invitationType,
        maxCompanions: invitation.maxCompanions,
        cancelledAt: invitation.cancelledAt?.toISOString() ?? null,
        members: invitation.members.map((member) => ({
          name: member.name,
          isPrimary: member.isPrimary,
          position: member.position,
        })),
      },
      template: {
        id: template.id,
        version: template.version,
        locale: template.locale,
        status: template.status,
        contentHash: template.contentHash,
        provider: template.provider,
        providerTemplateName: template.providerTemplateName,
        assetId: template.assetId,
        assetSha256: null,
      },
    }),
  );
}

function positiveInteger(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}".`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

function bandOf(index) {
  if (index < BANDS.checkIn.end) return "checkIn";
  if (index < BANDS.messaged.end) return "messaged";
  if (index < BANDS.sendable.end) return "sendable";
  return "tail";
}

/**
 * Describes one invitation group and the RSVP response that has to agree with
 * it, because `assert_rsvp_aggregate` recomputes the status and the expected
 * attendance from the members and rejects any disagreement at commit.
 */
function describeGroup(index) {
  const band = bandOf(index);
  const family = FAMILY_NAMES[index % FAMILY_NAMES.length];
  const given = GIVEN_NAMES[index % GIVEN_NAMES.length];
  const base = {
    index,
    band,
    id: id.group(index),
    displayName: `عائلة ${family} ${index}`,
    // A Latin contact name keeps the manual-search scenario readable without
    // depending on an Arabic term in a shell argument.
    contactName: `Load Guest ${given} ${index}`,
    phoneE164: `+9665${String(index).padStart(8, "0")}`,
    createdAt: new Date(CREATED_AT_BASE + Math.floor(index / 5) * 1000),
    cancelledAt:
      band === "tail" && index % CANCELLED_EVERY === CANCELLED_EVERY - 1
        ? new Date(CREATED_AT_BASE + index * 7)
        : null,
  };

  if (band === "checkIn") {
    // One primary member plus a large companion party, so many virtual users
    // can contend for the same invitation group before it fills up.
    const companions = CHECK_IN_TARGET_ATTENDEES - 1;
    return {
      ...base,
      invitationType: "PRIMARY_WITH_COMPANIONS",
      maxCompanions: companions,
      members: [{ position: 1, isPrimary: true, name: `${given} ${family}` }],
      rsvp: {
        status: "ACCEPTED",
        companionCount: companions,
        attending: [true],
      },
      rsvpStatus: "ACCEPTED",
      expectedAttendees: CHECK_IN_TARGET_ATTENDEES,
    };
  }

  const typeSelector = index % 10;
  let invitationType = "NAMED_GROUP";
  let maxCompanions = 0;
  let memberCount = 2 + (index % 3);
  if (typeSelector === 0) {
    invitationType = "SINGLE";
    memberCount = 1;
  } else if (typeSelector === 1) {
    invitationType = "PRIMARY_WITH_COMPANIONS";
    maxCompanions = 4;
    memberCount = 1;
  }

  const members = [];
  for (let position = 1; position <= memberCount; position += 1) {
    members.push({
      position,
      // SINGLE and PRIMARY_WITH_COMPANIONS must carry exactly one primary
      // member; NAMED_GROUP is allowed at most one and is seeded without.
      isPrimary: invitationType !== "NAMED_GROUP",
      name: `${GIVEN_NAMES[(index + position) % GIVEN_NAMES.length]} ${family}`,
    });
  }

  const rsvpSelector = index % 20;
  const canPartiallyAccept =
    invitationType === "NAMED_GROUP" && memberCount >= 2;
  if (rsvpSelector >= 15) {
    // No RSVP row at all: the aggregate must stay pending with zero attendance.
    return {
      ...base,
      invitationType,
      maxCompanions,
      members,
      rsvp: null,
      rsvpStatus: "PENDING",
      expectedAttendees: 0,
    };
  }
  if (rsvpSelector >= 13) {
    return {
      ...base,
      invitationType,
      maxCompanions,
      members,
      rsvp: {
        status: "DECLINED",
        companionCount: 0,
        attending: members.map(() => false),
      },
      rsvpStatus: "DECLINED",
      expectedAttendees: 0,
    };
  }
  if (rsvpSelector >= 11 && canPartiallyAccept) {
    return {
      ...base,
      invitationType,
      maxCompanions,
      members,
      rsvp: {
        status: "PARTIALLY_ACCEPTED",
        companionCount: 0,
        attending: members.map((_, position) => position === 0),
      },
      rsvpStatus: "PARTIALLY_ACCEPTED",
      expectedAttendees: 1,
    };
  }
  const companionCount =
    invitationType === "PRIMARY_WITH_COMPANIONS" ? maxCompanions : 0;
  return {
    ...base,
    invitationType,
    maxCompanions,
    members,
    rsvp: {
      status: "ACCEPTED",
      companionCount,
      attending: members.map(() => true),
    },
    rsvpStatus: "ACCEPTED",
    expectedAttendees: memberCount + companionCount,
  };
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const startedAt = Date.now();

try {
  const existing = await prisma.invitationGroup.count({
    where: { eventId: fixtures.eventId },
  });
  if (existing > 0) {
    throw new Error(
      `The load event already holds ${existing} invitation groups. Check-in records and ` +
        "credit ledger entries are append-only, so this fixture cannot be rewritten in place. " +
        "Recreate the test database (docker compose --profile test restart postgres-test, " +
        "then prisma migrate deploy) and seed again.",
    );
  }

  const { user, event, template, membership } = await seedFoundation();
  const context = { user, event, template, membership };

  console.info(
    `seeding ${TOTAL_GROUPS} invitation groups in chunks of ${CHUNK_SIZE}…`,
  );
  let checkedInSeeded = 0;
  for (let start = 0; start < TOTAL_GROUPS; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, TOTAL_GROUPS);
    checkedInSeeded = await seedChunk(context, start, end, checkedInSeeded);
    console.info(
      `  ${end}/${TOTAL_GROUPS} groups (${Math.round((Date.now() - startedAt) / 1000)}s)`,
    );
  }

  await seedAuditLogs(context);
  await seedCreditLedger(context);

  console.info(
    `Load fixtures are ready in ${Math.round((Date.now() - startedAt) / 1000)}s.`,
  );
  console.info(`  event id     ${event.id}`);
  console.info(`  template id  ${template.id}`);
  console.info(
    `  check-in targets ${CHECK_IN_TARGETS} groups of ${CHECK_IN_TARGET_ATTENDEES} confirmed attendees`,
  );
  console.info(
    `  sendable band    ${SENDABLE_GROUPS} prepared groups starting at index ${BANDS.sendable.start}`,
  );
} finally {
  await prisma.$disconnect();
}

/** Creates the host, event, membership, approved template and credit account. */
async function seedFoundation() {
  const user = await prisma.user.upsert({
    where: { authProviderId: fixtures.authProviderId },
    create: {
      id: fixtures.userId,
      authProviderId: fixtures.authProviderId,
      email: "developer@localhost",
      displayName: "Load Test Host",
    },
    update: { displayName: "Load Test Host" },
  });

  const event = await prisma.event.upsert({
    where: { id: fixtures.eventId },
    create: {
      id: fixtures.eventId,
      ownerUserId: user.id,
      nameAr: "مناسبة اختبار الحمل",
      nameEn: "Load test event",
      eventType: "WEDDING",
      eventDate: EVENT_DATE,
      startTime: EVENT_START_TIME,
      timezone: "Asia/Riyadh",
      venueNameAr: "قاعة الاختبار",
      venueNameEn: "Load test venue",
      city: "الرياض",
      // Event-day status plus QR enabled is the only combination that allows
      // both the check-in write path and the check-in dashboard.
      status: "EVENT_DAY",
      qrEnabled: true,
    },
    update: { status: "EVENT_DAY", qrEnabled: true },
  });

  const membership = await prisma.eventMembership.upsert({
    where: { eventId_userId: { eventId: event.id, userId: user.id } },
    create: {
      id: fixtures.membershipId,
      eventId: event.id,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
      acceptedAt: new Date(CREATED_AT_BASE),
    },
    update: { role: "OWNER", status: "ACTIVE" },
  });

  const template = await prisma.invitationTemplate.upsert({
    where: { id: fixtures.templateId },
    create: {
      id: fixtures.templateId,
      eventId: event.id,
      createdBy: user.id,
      templateKey: "load-test-invitation",
      version: 1,
      locale: "ar_SA",
      purpose: "INVITATION",
      status: "APPROVED",
      displayName: "Load test invitation",
      provider: "META_WHATSAPP",
      providerTemplateName: "dawah_load_test_invitation_ar",
      bodyTemplate: "يسرنا دعوتكم {{guestName}} إلى {{eventName}}.",
      variableSchema: ["guestName", "eventName"],
      interactiveComponents: [],
      contentHash: sha256("load-test-invitation-v1"),
      approvedAt: new Date(CREATED_AT_BASE),
    },
    update: {},
  });

  await prisma.creditAccount.upsert({
    where: { eventId: event.id },
    create: { id: fixtures.creditAccountId, eventId: event.id },
    update: {},
  });

  await prisma.sendBatch.upsert({
    where: { id: fixtures.sendBatchId },
    create: {
      id: fixtures.sendBatchId,
      eventId: event.id,
      createdBy: user.id,
      status: "COMPLETED",
      messageType: "INVITATION",
      requestHash: sha256("load-request"),
      selectionHash: sha256("load-selection"),
      confirmationHash: sha256("load-confirmation"),
      totalMessages: MESSAGED_GROUPS,
      estimatedCreditUnits: MESSAGED_GROUPS,
      queuedAt: new Date(CREATED_AT_BASE),
      dispatchStartedAt: new Date(CREATED_AT_BASE + 1000),
      startedAt: new Date(CREATED_AT_BASE + 2000),
      completedAt: new Date(CREATED_AT_BASE + 60000),
    },
    update: {},
  });

  return { user, event, template, membership };
}

/**
 * Writes one chunk in a single transaction. The invitation-structure and
 * RSVP-aggregate triggers are deferred to commit, so groups, members, responses
 * and response members must land together.
 */
async function seedChunk(context, start, end, checkedInSeeded) {
  const { user, event, template, membership } = context;
  const groups = [];
  const members = [];
  const responses = [];
  const responseMembers = [];
  const snapshots = [];
  const messages = [];
  const checkInStates = [];
  const checkInRecords = [];
  let checkedIn = checkedInSeeded;

  for (let index = start; index < end; index += 1) {
    const group = describeGroup(index);
    groups.push({
      id: group.id,
      eventId: event.id,
      displayName: group.displayName,
      contactName: group.contactName,
      phoneE164: group.phoneE164,
      phoneCountry: "SA",
      invitationType: group.invitationType,
      maxCompanions: group.maxCompanions,
      rsvpStatus: group.rsvpStatus,
      expectedAttendees: group.expectedAttendees,
      createdBy: user.id,
      createdAt: group.createdAt,
      cancelledAt: group.cancelledAt,
    });

    for (const member of group.members) {
      members.push({
        id: id.member(index, member.position),
        invitationGroupId: group.id,
        name: member.name,
        position: member.position,
        isPrimary: member.isPrimary,
        createdAt: group.createdAt,
      });
    }

    if (group.rsvp) {
      responses.push({
        id: id.rsvp(index),
        invitationGroupId: group.id,
        status: group.rsvp.status,
        companionCount: group.rsvp.companionCount,
        source: index % 3 === 0 ? "GUEST_WEB" : "WHATSAPP",
        respondedAt: new Date(group.createdAt.getTime() + 3600000),
      });
      group.members.forEach((member, position) => {
        responseMembers.push({
          id: id.rsvpMember(index, member.position),
          rsvpId: id.rsvp(index),
          invitationGroupId: group.id,
          guestMemberId: id.member(index, member.position),
          attending: group.rsvp.attending[position],
        });
      });
    }

    const prepared = group.band === "messaged" || group.band === "sendable";
    if (prepared) {
      const sourceHash = invitationSourceHash(event, group, template);
      const variables = {
        guestName: group.displayName,
        eventName: event.nameAr,
      };
      const renderedBody = `يسرنا دعوتكم ${group.displayName} إلى ${event.nameAr}.`;
      const renderedContent = { body: renderedBody, extraMessage: null };
      snapshots.push({
        id: id.snapshot(index),
        eventId: event.id,
        invitationGroupId: group.id,
        templateId: template.id,
        templateVersion: template.version,
        locale: template.locale,
        createdBy: user.id,
        variables,
        renderedBody,
        renderedContent,
        readinessResult: { ready: true, issues: [] },
        isReady: true,
        sourceHash,
        contentHash: sha256(`${group.id}:${sourceHash}`),
        createdAt: new Date(group.createdAt.getTime() + 7200000),
      });

      if (group.band === "messaged") {
        const position = index - BANDS.messaged.start;
        const sent = position < LEDGER_ENTRIES;
        const status = sent
          ? SENT_STATUSES[position % SENT_STATUSES.length]
          : UNSENT_STATUSES[position % UNSENT_STATUSES.length];
        const queuedAt = new Date(group.createdAt.getTime() + 10800000);
        messages.push({
          id: id.message(index),
          eventId: event.id,
          sendBatchId: fixtures.sendBatchId,
          invitationGroupId: group.id,
          contentSnapshotId: id.snapshot(index),
          provider: template.provider,
          providerMessageId: sent ? `wamid.load.${position}` : null,
          messageType: "INVITATION",
          status,
          recipientPhoneE164: group.phoneE164,
          providerTemplateName: template.providerTemplateName,
          templateId: template.id,
          templateVersion: template.version,
          locale: template.locale,
          templateVariables: variables,
          templateParameterOrder: template.variableSchema,
          renderedContent,
          sourceHash,
          contentHash: sha256(`${group.id}:${sourceHash}`),
          creditUnits: 1,
          // Anything past QUEUED has been attempted at least once; the
          // messages_delivery_state_valid check requires it for SENDING.
          attemptCount: status === "QUEUED" ? 0 : 1,
          queuedAt,
          sendingAt:
            status === "QUEUED" ? null : new Date(queuedAt.getTime() + 1000),
          sentAt: sent ? new Date(queuedAt.getTime() + 2000) : null,
          deliveredAt:
            status === "DELIVERED" ||
            status === "READ" ||
            status === "RESPONDED"
              ? new Date(queuedAt.getTime() + 5000)
              : null,
          readAt:
            status === "READ" || status === "RESPONDED"
              ? new Date(queuedAt.getTime() + 9000)
              : null,
          respondedAt:
            status === "RESPONDED"
              ? new Date(queuedAt.getTime() + 20000)
              : null,
          failedAt:
            status === "FAILED" ? new Date(queuedAt.getTime() + 3000) : null,
          cancelledAt:
            status === "CANCELLED" ? new Date(queuedAt.getTime() + 3000) : null,
          failureClass: status === "FAILED" ? "PERMANENT" : null,
          failureCode: status === "FAILED" ? "131026" : null,
          failureReason:
            status === "FAILED"
              ? "The destination cannot receive this WhatsApp message."
              : null,
          createdAt: queuedAt,
        });

        // Partial arrivals on every other eligible group, so the dashboard has
        // a realistic mix of fully, partially and not-arrived parties.
        const eligible =
          group.expectedAttendees > 0 && group.cancelledAt === null;
        if (eligible && checkedIn < CHECKED_IN_GROUPS && position % 2 === 0) {
          const count = 1 + (index % group.expectedAttendees);
          const arrivedAt = new Date(
            CREATED_AT_BASE + 86400000 + checkedIn * 1000,
          );
          checkInStates.push({
            id: id.checkInState(index),
            eventId: event.id,
            invitationGroupId: group.id,
            checkedInCount: count,
            version: 1,
            firstCheckedInAt: arrivedAt,
            lastCheckedInAt: arrivedAt,
            lastCheckedInByUserId: user.id,
            lastDeviceId: `seed-scanner-${checkedIn % 8}`,
          });
          checkInRecords.push({
            id: id.checkInRecord(index),
            eventId: event.id,
            invitationGroupId: group.id,
            checkInStateId: id.checkInState(index),
            actorUserId: user.id,
            actorMembershipId: membership.id,
            source: checkedIn % 2 === 0 ? "QR" : "MANUAL",
            attendeeCount: count,
            previousCount: 0,
            newCount: count,
            deviceId: `seed-scanner-${checkedIn % 8}`,
            idempotencyKeyHash: sha256(`seed-check-in-key:${index}`),
            requestHash: sha256(`seed-check-in-request:${index}`),
            createdAt: arrivedAt,
          });
          checkedIn += 1;
        }
      }
    }
  }

  await prisma.$transaction(
    async (transaction) => {
      await transaction.invitationGroup.createMany({ data: groups });
      await transaction.guestMember.createMany({ data: members });
      if (responses.length > 0) {
        await transaction.rsvp.createMany({ data: responses });
        await transaction.rsvpMember.createMany({ data: responseMembers });
      }
      if (snapshots.length > 0) {
        await transaction.invitationContentSnapshot.createMany({
          data: snapshots,
        });
      }
      if (messages.length > 0) {
        await transaction.message.createMany({ data: messages });
      }
      if (checkInStates.length > 0) {
        await transaction.checkInState.createMany({ data: checkInStates });
        await transaction.checkInRecord.createMany({ data: checkInRecords });
      }
    },
    { maxWait: 60000, timeout: 600000 },
  );

  return checkedIn;
}

/**
 * Audit history for the dashboard's duplicate-attempt counter. The action is
 * filtered without a supporting index, which is one of the findings recorded in
 * docs/query-plan-review.md; a realistic row count makes it measurable.
 */
async function seedAuditLogs({ user, event }) {
  const actions = [
    "check_in.duplicate_attempt",
    "check_in.recorded",
    "export.requested",
    "invitation.updated",
    "rsvp.updated",
  ];
  for (let start = 0; start < AUDIT_LOGS; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, AUDIT_LOGS);
    const rows = [];
    for (let index = start; index < end; index += 1) {
      rows.push({
        id: id.auditLog(index),
        eventId: event.id,
        actorUserId: user.id,
        actorType: "USER",
        action: actions[index % actions.length],
        targetType: "InvitationGroup",
        targetId: id.group(index % TOTAL_GROUPS),
        metadata: { seeded: true },
        createdAt: new Date(CREATED_AT_BASE + 86400000 + index * 500),
      });
    }
    await prisma.auditLog.createMany({ data: rows });
  }
  console.info(`  ${AUDIT_LOGS} audit log entries`);
}

/**
 * One purchase followed by one send-usage entry per sent message, so the credit
 * overview reconciles exactly against the chargeable message count.
 */
async function seedCreditLedger({ user, event }) {
  await prisma.creditLedgerEntry.create({
    data: {
      id: id.ledgerEntry(0),
      eventId: event.id,
      creditAccountId: fixtures.creditAccountId,
      actorUserId: user.id,
      entryType: "PURCHASE",
      units: PURCHASED_UNITS,
      referenceType: "CreditPurchase",
      referenceId: "load-fixture-purchase",
      description: "Load fixture opening balance",
      createdAt: new Date(CREATED_AT_BASE),
    },
  });

  for (let start = 0; start < LEDGER_ENTRIES; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, LEDGER_ENTRIES);
    const rows = [];
    for (let position = start; position < end; position += 1) {
      const groupIndex = BANDS.messaged.start + position;
      rows.push({
        id: id.ledgerEntry(position + 1),
        eventId: event.id,
        creditAccountId: fixtures.creditAccountId,
        messageId: id.message(groupIndex),
        entryType: "SEND_USAGE",
        units: -1,
        referenceType: "Message",
        referenceId: id.message(groupIndex),
        createdAt: new Date(CREATED_AT_BASE + 86400000 + position * 100),
      });
    }
    await prisma.creditLedgerEntry.createMany({ data: rows });
  }
  console.info(
    `  credit ledger: +${PURCHASED_UNITS} purchased, -${LEDGER_ENTRIES} used`,
  );
}
