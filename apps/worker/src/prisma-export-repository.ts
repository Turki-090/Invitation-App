import {
  hasPermission,
  MembershipRole,
  Permission,
  type PermissionConfiguration,
  type Permission as PermissionValue,
} from "@dawah/domain";
import { Prisma, PrismaClient, type ExportPreset } from "@prisma/client";
import type {
  CompletedExportArtifact,
  CompleteExportResult,
  ExportClaimResult,
  ExportCursor,
  ExportProcessorRepository,
  ExportQueueJobData,
  ExportRow,
  ExportWorkItem,
} from "./export-processor";

const DELIVERED_MESSAGE_STATUSES = [
  "SENT",
  "DELIVERED",
  "READ",
  "RESPONDED",
] as const;

/**
 * Persistence for background guest exports. Every read is scoped by event and
 * by the requester's still-current membership, so a revoked member never
 * receives a file that their permissions no longer allow.
 */
export class PrismaExportRepository implements ExportProcessorRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async claim(
    data: ExportQueueJobData,
    now: Date,
  ): Promise<ExportClaimResult> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "export_jobs" WHERE "id" = ${data.exportJobId}::uuid FOR UPDATE
      `;
      const job = await transaction.exportJob.findUnique({
        where: { id: data.exportJobId },
      });
      if (!job) return { outcome: "SKIPPED", reason: "NOT_FOUND" } as const;
      if (job.eventId !== data.eventId) {
        return { outcome: "SKIPPED", reason: "EVENT_MISMATCH" } as const;
      }
      if (job.status !== "QUEUED") {
        return { outcome: "SKIPPED", reason: "ALREADY_PROCESSED" } as const;
      }

      const membership = await transaction.eventMembership.findFirst({
        where: {
          eventId: job.eventId,
          userId: job.requestedByUserId,
          status: "ACTIVE",
        },
        select: { role: true, permissionsJson: true },
      });
      if (!membership || !allows(membership, Permission.GUEST_EXPORT)) {
        return {
          outcome: "ACCESS_REVOKED",
          eventId: job.eventId,
          exportJobId: job.id,
        } as const;
      }

      await transaction.exportJob.update({
        where: { id: job.id },
        data: { status: "PROCESSING", processingAt: now },
      });
      return {
        outcome: "CLAIMED",
        job: {
          eventId: job.eventId,
          exportJobId: job.id,
          requestedByUserId: job.requestedByUserId,
          format: job.format,
          preset: job.preset,
          includePhone: allows(membership, Permission.GUEST_PHONE_VIEW),
        },
      } as const;
    });
  }

  public async listRows(
    job: ExportWorkItem,
    cursor: ExportCursor | null,
    pageSize: number,
  ): Promise<readonly ExportRow[]> {
    const invitations = await this.prisma.invitationGroup.findMany({
      where: {
        eventId: job.eventId,
        cancelledAt: null,
        ...presetFilter(job.preset),
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: pageSize,
      include: {
        members: { orderBy: { position: "asc" }, select: { name: true } },
        checkInState: { select: { checkedInCount: true } },
        messages: {
          where: { messageType: "INVITATION" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { status: true },
        },
      },
    });
    return invitations.map((invitation) => ({
      cursor: { createdAt: invitation.createdAt, id: invitation.id },
      invitationId: invitation.id,
      displayName: invitation.displayName,
      contactName: invitation.contactName,
      phoneE164: job.includePhone ? invitation.phoneE164 : null,
      invitationType: invitation.invitationType,
      maxCompanions: invitation.maxCompanions,
      guestNames: invitation.members.map((member) => member.name),
      rsvpStatus: invitation.rsvpStatus,
      expectedAttendees: invitation.expectedAttendees,
      checkedInCount: invitation.checkInState?.checkedInCount ?? 0,
      latestDeliveryStatus: invitation.messages.at(0)?.status ?? null,
    }));
  }

  public async complete(
    job: ExportWorkItem,
    artifact: CompletedExportArtifact,
    now: Date,
  ): Promise<CompleteExportResult> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "export_jobs" WHERE "id" = ${job.exportJobId}::uuid FOR UPDATE
      `;
      const current = await transaction.exportJob.findUnique({
        where: { id: job.exportJobId },
        include: { outputAsset: { select: { objectKey: true } } },
      });
      if (!current || current.eventId !== job.eventId) {
        return { outcome: "REJECTED", retainedObjectKey: null } as const;
      }
      if (current.status === "COMPLETED") {
        return {
          outcome: "ALREADY_COMPLETED",
          retainedObjectKey: current.outputAsset?.objectKey ?? null,
        } as const;
      }
      if (current.status !== "PROCESSING") {
        return { outcome: "REJECTED", retainedObjectKey: null } as const;
      }

      const asset = await transaction.storedAsset.create({
        data: {
          eventId: job.eventId,
          createdBy: job.requestedByUserId,
          kind: "GENERATED_FILE",
          status: "READY",
          storageProvider: "s3-compatible",
          bucket: artifact.bucket,
          objectKey: artifact.objectKey,
          originalFilename: artifact.originalFilename,
          contentType: artifact.contentType,
          byteSize: artifact.byteSize,
          sha256: artifact.sha256,
          isPrivate: true,
          metadata: {
            exportJobId: job.exportJobId,
            preset: job.preset,
            format: job.format,
            includesPhoneNumbers: job.includePhone,
          },
          expiresAt: artifact.expiresAt,
          uploadedAt: now,
          validatedAt: now,
        },
      });
      await transaction.exportJob.update({
        where: { id: job.exportJobId },
        data: {
          status: "COMPLETED",
          outputAssetId: asset.id,
          rowCount: artifact.rowCount,
          completedAt: now,
          expiresAt: artifact.expiresAt,
          failureCode: null,
          failureMessage: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId: job.eventId,
          actorUserId: job.requestedByUserId,
          actorType: "SYSTEM",
          action: "export.completed",
          targetType: "ExportJob",
          targetId: job.exportJobId,
          metadata: {
            format: job.format,
            preset: job.preset,
            rowCount: artifact.rowCount,
            includesPhoneNumbers: job.includePhone,
          },
        },
      });
      await transaction.notification.create({
        data: {
          eventId: job.eventId,
          userId: job.requestedByUserId,
          kind: "EXPORT_READY",
          sourceType: "ExportJob",
          sourceId: job.exportJobId,
          data: {
            format: job.format,
            preset: job.preset,
            rowCount: artifact.rowCount,
            expiresAt: artifact.expiresAt.toISOString(),
          },
        },
      });
      return {
        outcome: "COMPLETED",
        retainedObjectKey: artifact.objectKey,
      } as const;
    });
  }

  public async markFailed(
    data: ExportQueueJobData,
    failure: { readonly code: string; readonly message: string },
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const job = await transaction.exportJob.findUnique({
        where: { id: data.exportJobId },
        select: {
          id: true,
          eventId: true,
          requestedByUserId: true,
          status: true,
        },
      });
      if (
        !job ||
        job.eventId !== data.eventId ||
        job.status === "COMPLETED" ||
        job.status === "FAILED"
      ) {
        return false;
      }
      await transaction.exportJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedAt: now,
          failureCode: failure.code.slice(0, 100),
          failureMessage: failure.message.slice(0, 1_000),
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId: job.eventId,
          actorUserId: job.requestedByUserId,
          actorType: "SYSTEM",
          action: "export.failed",
          targetType: "ExportJob",
          targetId: job.id,
          metadata: { failureCode: failure.code },
        },
      });
      await transaction.notification.create({
        data: {
          eventId: job.eventId,
          userId: job.requestedByUserId,
          kind: "EXPORT_FAILED",
          sourceType: "ExportJob",
          sourceId: job.id,
          data: { failureCode: failure.code },
        },
      });
      return true;
    });
  }
}

function presetFilter(preset: ExportPreset): Prisma.InvitationGroupWhereInput {
  switch (preset) {
    case "CONFIRMED_ATTENDANCE":
    case "CHECK_IN_LIST":
      return { rsvpStatus: { in: ["ACCEPTED", "PARTIALLY_ACCEPTED"] } };
    case "PENDING_RSVP":
      return {
        rsvpStatus: "PENDING",
        messages: {
          some: {
            messageType: "INVITATION",
            status: { in: [...DELIVERED_MESSAGE_STATUSES] },
          },
        },
      };
    case "FINAL_ATTENDANCE":
      return { checkInState: { checkedInCount: { gt: 0 } } };
    case "FULL_GUEST_LIST":
      return {};
  }
}

function allows(
  membership: {
    readonly role: string;
    readonly permissionsJson: Prisma.JsonValue;
  },
  permission: PermissionValue,
): boolean {
  return hasPermission(
    membership.role as MembershipRole,
    permission,
    permissionConfiguration(membership.permissionsJson),
  );
}

const knownPermissions = new Set<string>(Object.values(Permission));

function permissionConfiguration(
  value: Prisma.JsonValue,
): PermissionConfiguration {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is PermissionValue =>
        typeof entry === "string" && knownPermissions.has(entry),
    );
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.mode === "CUSTOM" &&
    Array.isArray(value.permissions)
  ) {
    return {
      mode: "CUSTOM",
      permissions: value.permissions.filter(
        (entry): entry is PermissionValue =>
          typeof entry === "string" && knownPermissions.has(entry),
      ),
    };
  }
  return [];
}
