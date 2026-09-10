import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ApproveInvitationTemplateInput,
  CreateInvitationTemplateInput,
  CreatePreparationSnapshotsInput,
  CreatePreparationSnapshotsResult,
  InvitationPreview,
  InvitationPreviewRequest,
  InvitationTemplate as InvitationTemplateContract,
  ListInvitationTemplatesResponse,
  ReadinessQuery,
  ReadinessResponse,
  UpdateInvitationTemplateInput,
} from "@dawah/api-contract";
import {
  createInvitationContentSnapshot,
  computeInvitationReadiness,
  InvitationContentLocale,
  invitationContentDigestInput,
  Permission,
  renderMessageTemplate,
  validateMessageTemplate,
  type InvitationReadinessInput,
} from "@dawah/domain";
import {
  Prisma,
  type Event,
  type InvitationTemplate,
  type StoredAsset,
} from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  invitationSourceHash,
  stableSerialize,
} from "./invitation-source-hash";

type TemplateWithAsset = InvitationTemplate & { asset: StoredAsset | null };
type InvitationWithMembers = Prisma.InvitationGroupGetPayload<{
  include: { members: true };
}>;

interface PreparedSnapshot {
  invitation: InvitationWithMembers;
  sourceHash: string;
  contentHash: string;
  domain: ReturnType<typeof createInvitationContentSnapshot>;
  renderedBody: string;
  renderedExtraMessage: string | null;
  renderedContent: Prisma.InputJsonObject;
  readinessResult: Prisma.InputJsonObject;
}

@Injectable()
export class PreparationService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
  ) {}

  public async listTemplates(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<ListInvitationTemplatesResponse> {
    await this.access.resolve(principal, eventId, Permission.INVITATION_SEND);
    const templates = await this.prisma.invitationTemplate.findMany({
      where: { eventId },
      include: { asset: true },
      orderBy: [
        { status: "asc" },
        { locale: "asc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });
    return { items: templates.map((template) => this.toTemplate(template)) };
  }

  public async createTemplate(
    principal: AuthPrincipal,
    eventId: string,
    input: CreateInvitationTemplateInput,
  ): Promise<InvitationTemplateContract> {
    const { event, user } = await this.access.resolve(
      principal,
      eventId,
      Permission.INVITATION_SEND,
    );
    this.assertEventWritable(event);
    const asset = await this.resolveAsset(eventId, input.assetId ?? null);
    const material = this.templateMaterial(input.body, input.extraMessage);
    const variables = this.validateTemplateMaterial(material);
    const templateKey = randomUUID();
    const contentHash = this.templateContentHash({
      name: input.name,
      locale: input.locale,
      body: input.body,
      extraMessage: input.extraMessage ?? null,
      providerTemplateName: input.providerTemplateName ?? null,
      assetId: asset?.id ?? null,
      assetSha256: asset?.sha256 ?? null,
    });

    const template = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.invitationTemplate.create({
        data: {
          eventId,
          createdBy: user.id,
          templateKey,
          version: 1,
          locale: this.toDatabaseLocale(input.locale),
          displayName: input.name,
          bodyTemplate: input.body,
          extraMessageTemplate: input.extraMessage?.trim() || null,
          providerTemplateName: input.providerTemplateName?.trim() || null,
          variableSchema: [...variables],
          interactiveComponents: [],
          contentHash,
          assetId: asset?.id ?? null,
        },
        include: { asset: true },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "invitation_template.created",
          targetType: "InvitationTemplate",
          targetId: created.id,
          metadata: {
            templateKey,
            version: created.version,
            locale: input.locale,
            variableKeys: [...variables],
            assetId: asset?.id ?? null,
          },
        },
      });
      return created;
    });
    return this.toTemplate(template);
  }

  public async updateTemplate(
    principal: AuthPrincipal,
    eventId: string,
    templateId: string,
    input: UpdateInvitationTemplateInput,
  ): Promise<InvitationTemplateContract> {
    const { event, user } = await this.access.resolve(
      principal,
      eventId,
      Permission.INVITATION_SEND,
    );
    this.assertEventWritable(event);

    const created = await this.prisma.$transaction(async (transaction) => {
      const candidate = await this.findTemplate(
        transaction,
        eventId,
        templateId,
      );
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`template-family:${eventId}:${candidate.templateKey}`}, 0)) IS NULL AS locked
      `;
      const existing = await this.findTemplate(
        transaction,
        eventId,
        templateId,
      );
      if (existing.status === "ARCHIVED") this.throwTemplateArchived();
      if (existing.version !== input.expectedVersion) {
        this.throwTemplateVersionConflict();
      }
      const latest = await transaction.invitationTemplate.findFirstOrThrow({
        where: { eventId, templateKey: existing.templateKey },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        select: { id: true, version: true },
      });
      if (latest.id !== existing.id) {
        throw new ConflictException({
          code: "TEMPLATE_VERSION_NOT_LATEST",
          message: "Create a new version from the latest template version.",
        });
      }

      const locale = input.locale ?? this.toContractLocale(existing.locale);
      const name = input.name ?? existing.displayName;
      const body = input.body ?? existing.bodyTemplate;
      const extraMessage =
        input.extraMessage === undefined
          ? existing.extraMessageTemplate
          : input.extraMessage?.trim() || null;
      const requestedAssetId =
        input.assetId === undefined ? existing.assetId : input.assetId;
      const providerTemplateName =
        input.providerTemplateName === undefined
          ? existing.providerTemplateName
          : input.providerTemplateName?.trim() || null;
      const asset = await this.resolveAsset(
        eventId,
        requestedAssetId,
        transaction,
      );
      const variables = this.validateTemplateMaterial(
        this.templateMaterial(body, extraMessage ?? undefined),
      );
      const nextVersion = latest.version + 1;
      const contentHash = this.templateContentHash({
        name,
        locale,
        body,
        extraMessage,
        providerTemplateName,
        assetId: asset?.id ?? null,
        assetSha256: asset?.sha256 ?? null,
      });

      if (existing.status === "DRAFT") {
        await transaction.invitationTemplate.update({
          where: { id: existing.id },
          data: { status: "ARCHIVED", archivedAt: new Date() },
        });
      }
      const next = await transaction.invitationTemplate.create({
        data: {
          eventId,
          createdBy: user.id,
          templateKey: existing.templateKey,
          version: nextVersion,
          locale: this.toDatabaseLocale(locale),
          displayName: name,
          bodyTemplate: body,
          extraMessageTemplate: extraMessage,
          variableSchema: [...variables],
          interactiveComponents:
            existing.interactiveComponents as Prisma.InputJsonValue,
          contentHash,
          assetId: asset?.id ?? null,
          provider: existing.provider,
          providerTemplateName,
        },
        include: { asset: true },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "invitation_template.version_created",
          targetType: "InvitationTemplate",
          targetId: next.id,
          metadata: {
            templateKey: existing.templateKey,
            previousTemplateId: existing.id,
            previousVersion: existing.version,
            version: nextVersion,
          },
        },
      });
      return next as TemplateWithAsset;
    });
    return this.toTemplate(created);
  }

  public async approveTemplate(
    principal: AuthPrincipal,
    eventId: string,
    templateId: string,
    input: ApproveInvitationTemplateInput,
  ): Promise<InvitationTemplateContract> {
    const { event, user } = await this.access.resolve(
      principal,
      eventId,
      Permission.INVITATION_SEND,
    );
    this.assertEventWritable(event);
    const approved = await this.prisma.$transaction(async (transaction) => {
      const candidate = await this.findTemplate(
        transaction,
        eventId,
        templateId,
      );
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`template-family:${eventId}:${candidate.templateKey}`}, 0)) IS NULL AS locked
      `;
      const current = await this.findTemplate(transaction, eventId, templateId);
      if (current.version !== input.expectedVersion) {
        this.throwTemplateVersionConflict();
      }
      if (current.status === "ARCHIVED") this.throwTemplateArchived();
      if (current.status === "APPROVED") return current;
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`template-default:${eventId}:${current.locale}`}, 0)) IS NULL AS locked
      `;
      const hasDefault = await transaction.invitationTemplate.count({
        where: { eventId, locale: current.locale, isDefault: true },
      });
      const result = await transaction.invitationTemplate.updateMany({
        where: {
          id: templateId,
          eventId,
          version: input.expectedVersion,
          status: "DRAFT",
        },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          isDefault: hasDefault === 0,
        },
      });
      if (result.count !== 1) this.throwTemplateVersionConflict();
      const template = await this.findTemplate(
        transaction,
        eventId,
        templateId,
      );
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "invitation_template.approved",
          targetType: "InvitationTemplate",
          targetId: templateId,
          metadata: {
            templateKey: template.templateKey,
            version: template.version,
            locale: this.toContractLocale(template.locale),
          },
        },
      });
      return template;
    });
    return this.toTemplate(approved);
  }

  public async archiveTemplate(
    principal: AuthPrincipal,
    eventId: string,
    templateId: string,
  ): Promise<InvitationTemplateContract> {
    const { event, user } = await this.access.resolve(
      principal,
      eventId,
      Permission.INVITATION_SEND,
    );
    this.assertEventWritable(event);
    const archived = await this.prisma.$transaction(async (transaction) => {
      const candidate = await this.findTemplate(
        transaction,
        eventId,
        templateId,
      );
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`template-family:${eventId}:${candidate.templateKey}`}, 0)) IS NULL AS locked
      `;
      const current = await this.findTemplate(transaction, eventId, templateId);
      if (current.status === "ARCHIVED") return current;
      const template = await transaction.invitationTemplate.update({
        where: { id: templateId },
        data: { status: "ARCHIVED", archivedAt: new Date(), isDefault: false },
        include: { asset: true },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "invitation_template.archived",
          targetType: "InvitationTemplate",
          targetId: templateId,
          metadata: {
            templateKey: template.templateKey,
            version: template.version,
          },
        },
      });
      return template;
    });
    return this.toTemplate(archived);
  }

  public async preview(
    principal: AuthPrincipal,
    eventId: string,
    input: InvitationPreviewRequest,
  ): Promise<InvitationPreview> {
    const { event } = await this.access.resolve(
      principal,
      eventId,
      Permission.INVITATION_SEND,
    );
    const template = await this.findTemplate(
      this.prisma,
      eventId,
      input.templateId,
    );
    const invitation = input.invitationId
      ? await this.findInvitation(eventId, input.invitationId)
      : this.sampleInvitation(eventId, input.invitationType, template.locale);
    if (invitation.invitationType !== input.invitationType) {
      throw new BadRequestException({
        code: "PREVIEW_INVITATION_TYPE_MISMATCH",
        message: "The selected invitation does not match the preview type.",
      });
    }
    const previewReadiness = this.computeReadiness(
      this.readinessInput(event, invitation, template, true),
      template,
    );
    if (!previewReadiness.ready) {
      throw new ConflictException({
        code: "PREVIEW_NOT_READY",
        message:
          "Resolve the invitation readiness issues before previewing it.",
        details: { issues: previewReadiness.issues },
      });
    }
    const prepared = this.prepareSnapshot(event, invitation, template, true);
    return {
      templateId: template.id,
      templateVersion: template.version,
      locale: this.toContractLocale(template.locale),
      invitationType: invitation.invitationType,
      renderedBody: prepared.renderedBody,
      renderedExtraMessage: prepared.renderedExtraMessage,
      scopeDescription: prepared.domain.scope,
      replyActions: prepared.domain.replyActions.map(({ label }) => label),
      variables: { ...prepared.domain.variables },
      assetId: template.assetId,
    };
  }

  public async readiness(
    principal: AuthPrincipal,
    eventId: string,
    query: ReadinessQuery,
  ): Promise<ReadinessResponse> {
    const { event } = await this.access.resolve(
      principal,
      eventId,
      Permission.INVITATION_SEND,
    );
    const template = await this.findTemplate(
      this.prisma,
      eventId,
      query.templateId,
    );
    const invitations = await this.prisma.invitationGroup.findMany({
      where: { eventId, cancelledAt: null },
      include: { members: { orderBy: { position: "asc" } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const sourceHashes = new Map<string, string>();
    const readiness = invitations.map((invitation) => {
      const domainInput = this.readinessInput(event, invitation, template);
      const result = this.computeReadiness(domainInput, template);
      const sourceHash = this.sourceHash(event, invitation, template);
      sourceHashes.set(invitation.id, sourceHash);
      return { invitation, result, sourceHash };
    });
    const snapshots =
      invitations.length === 0
        ? []
        : await this.prisma.invitationContentSnapshot.findMany({
            where: {
              eventId,
              OR: invitations.map(({ id }) => ({
                invitationGroupId: id,
                sourceHash: sourceHashes.get(id)!,
              })),
            },
            select: { id: true, invitationGroupId: true, sourceHash: true },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          });
    const currentSnapshot = new Map<string, string>();
    for (const snapshot of snapshots) {
      if (
        !currentSnapshot.has(snapshot.invitationGroupId) &&
        sourceHashes.get(snapshot.invitationGroupId) === snapshot.sourceHash
      ) {
        currentSnapshot.set(snapshot.invitationGroupId, snapshot.id);
      }
    }
    const readyInvitations = readiness.filter(
      ({ result }) => result.ready,
    ).length;
    const start = (query.page - 1) * query.pageSize;
    const pageItems = readiness.slice(start, start + query.pageSize);
    return {
      template: this.toTemplate(template),
      summary: {
        totalInvitations: invitations.length,
        readyInvitations,
        blockedInvitations: invitations.length - readyInvitations,
        snapshottedInvitations: currentSnapshot.size,
      },
      items: pageItems.map(({ invitation, result, sourceHash }) => ({
        invitationId: invitation.id,
        ready: result.ready,
        issues: result.issues.map((issue) => ({
          code: issue.code,
          field: issue.path,
          message: issue.message,
        })),
        sourceHash,
        latestSnapshotId: currentSnapshot.get(invitation.id) ?? null,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: invitations.length,
        totalPages: Math.ceil(invitations.length / query.pageSize),
      },
    };
  }

  public async createSnapshots(
    principal: AuthPrincipal,
    eventId: string,
    input: CreatePreparationSnapshotsInput,
  ): Promise<CreatePreparationSnapshotsResult> {
    const invitationIds = input.invitationIds
      ? [...new Set(input.invitationIds)]
      : undefined;
    return this.prisma.$transaction(
      async (transaction) => {
        const { user } = await this.access.resolve(
          principal,
          eventId,
          Permission.INVITATION_SEND,
          transaction,
        );
        await transaction.$queryRaw`
          SELECT "id" FROM "events" WHERE "id" = ${eventId}::uuid FOR SHARE
        `;
        const currentEvent = await transaction.event.findUniqueOrThrow({
          where: { id: eventId },
        });
        this.assertEventWritable(currentEvent);
        await transaction.$queryRaw`
          SELECT "id" FROM "invitation_templates"
          WHERE "id" = ${input.templateId}::uuid AND "event_id" = ${eventId}::uuid
          FOR SHARE
        `;
        const currentTemplate = await this.findTemplate(
          transaction,
          eventId,
          input.templateId,
        );
        if (currentTemplate.assetId) {
          await transaction.$queryRaw`
            SELECT "id" FROM "stored_assets"
            WHERE "id" = ${currentTemplate.assetId}::uuid
              AND "event_id" = ${eventId}::uuid
            FOR SHARE
          `;
        }
        const invitationLock = invitationIds
          ? Prisma.sql`
              SELECT "id" FROM "invitation_groups"
              WHERE "event_id" = ${eventId}::uuid
                AND "cancelled_at" IS NULL
                AND "id" IN (${Prisma.join(
                  invitationIds.map(
                    (invitationId) => Prisma.sql`${invitationId}::uuid`,
                  ),
                )})
              FOR SHARE
            `
          : Prisma.sql`
              SELECT "id" FROM "invitation_groups"
              WHERE "event_id" = ${eventId}::uuid AND "cancelled_at" IS NULL
              FOR SHARE
            `;
        await transaction.$queryRaw(invitationLock);
        await transaction.$queryRaw`
          SELECT gm."id" FROM "guest_members" gm
          INNER JOIN "invitation_groups" ig ON ig."id" = gm."invitation_group_id"
          WHERE ig."event_id" = ${eventId}::uuid AND ig."cancelled_at" IS NULL
          FOR SHARE OF gm
        `;
        const invitations = await transaction.invitationGroup.findMany({
          where: {
            eventId,
            cancelledAt: null,
            ...(invitationIds ? { id: { in: invitationIds } } : {}),
          },
          include: { members: { orderBy: { position: "asc" } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        if (invitationIds && invitations.length !== invitationIds.length) {
          throw new NotFoundException({
            code: "INVITATION_NOT_FOUND",
            message:
              "One or more invitations do not exist or are not accessible.",
          });
        }

        const ready: PreparedSnapshot[] = [];
        const blockedInvitationIds: string[] = [];
        for (const invitation of invitations) {
          const readinessInput = this.readinessInput(
            currentEvent,
            invitation,
            currentTemplate,
          );
          const result = this.computeReadiness(readinessInput, currentTemplate);
          if (!result.ready) {
            blockedInvitationIds.push(invitation.id);
            continue;
          }
          ready.push(
            this.prepareSnapshot(currentEvent, invitation, currentTemplate),
          );
        }

        const sourcePairs = ready.map(({ invitation, sourceHash }) => ({
          invitationGroupId: invitation.id,
          sourceHash,
        }));
        const existing =
          sourcePairs.length === 0
            ? []
            : await transaction.invitationContentSnapshot.findMany({
                where: { eventId, OR: sourcePairs },
                select: { id: true, invitationGroupId: true, sourceHash: true },
              });
        const existingKeys = new Set(
          existing.map(
            (snapshot) =>
              `${snapshot.invitationGroupId}:${snapshot.sourceHash}`,
          ),
        );
        const missing = ready.filter(
          ({ invitation, sourceHash }) =>
            !existingKeys.has(`${invitation.id}:${sourceHash}`),
        );
        const rows = missing.map((snapshot) => ({
          id: randomUUID(),
          eventId,
          invitationGroupId: snapshot.invitation.id,
          templateId: currentTemplate.id,
          templateVersion: currentTemplate.version,
          locale: currentTemplate.locale,
          assetId: currentTemplate.assetId,
          createdBy: user.id,
          variables: { ...snapshot.domain.variables },
          renderedBody: snapshot.renderedBody,
          renderedExtraMessage: snapshot.renderedExtraMessage,
          renderedContent: snapshot.renderedContent,
          readinessResult: snapshot.readinessResult,
          isReady: true,
          sourceHash: snapshot.sourceHash,
          contentHash: snapshot.contentHash,
          assetSha256: currentTemplate.asset?.sha256 ?? null,
          assetMetadata: currentTemplate.asset
            ? {
                mediaType: currentTemplate.asset.contentType,
                sizeBytes: currentTemplate.asset.byteSize,
                width: currentTemplate.asset.imageWidth,
                height: currentTemplate.asset.imageHeight,
              }
            : Prisma.DbNull,
        }));
        const created =
          rows.length === 0
            ? { count: 0 }
            : await transaction.invitationContentSnapshot.createMany({
                data: rows,
                skipDuplicates: true,
              });
        const all =
          sourcePairs.length === 0
            ? []
            : await transaction.invitationContentSnapshot.findMany({
                where: { eventId, OR: sourcePairs },
                select: { id: true },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              });
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "invitation_preparation.snapshotted",
            targetType: "InvitationTemplate",
            targetId: currentTemplate.id,
            metadata: {
              templateVersion: currentTemplate.version,
              requestedCount: invitations.length,
              createdCount: created.count,
              reusedCount: ready.length - created.count,
              blockedCount: blockedInvitationIds.length,
            },
          },
        });
        return {
          templateId: currentTemplate.id,
          createdCount: created.count,
          reusedCount: ready.length - created.count,
          blockedCount: blockedInvitationIds.length,
          snapshotIds: all.map(({ id }) => id),
          blockedInvitationIds,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 60_000,
      },
    );
  }

  private prepareSnapshot(
    event: Event,
    invitation: InvitationWithMembers,
    template: TemplateWithAsset,
    permitDraft = false,
  ): PreparedSnapshot {
    if (!this.assetReady(template)) {
      throw new ConflictException({
        code: "TEMPLATE_ASSET_NOT_READY",
        message: "The template image is not ready for invitation preparation.",
      });
    }
    const input = this.readinessInput(event, invitation, template, permitDraft);
    const domain = createInvitationContentSnapshot(input);
    const renderedBody = renderMessageTemplate(
      template.bodyTemplate,
      domain.variables,
    );
    const renderedExtraMessage = template.extraMessageTemplate
      ? renderMessageTemplate(template.extraMessageTemplate, domain.variables)
      : null;
    const sourceHash = this.sourceHash(event, invitation, template);
    const renderedContent = {
      snapshotVersion: domain.version,
      invitationType: domain.invitationType,
      recipientName: domain.recipientName,
      memberNames: [...domain.memberNames],
      maxCompanions: domain.maxCompanions,
      templateBody: template.bodyTemplate,
      extraMessageTemplate: template.extraMessageTemplate,
      renderedBody,
      renderedExtraMessage,
      scopeDescription: domain.scope,
      replyActions: domain.replyActions.map((action) => ({ ...action })),
    } satisfies Prisma.InputJsonObject;
    const contentHash = this.sha256(
      this.stableSerialize({
        domain: JSON.parse(invitationContentDigestInput(domain)),
        renderedContent,
        sourceHash,
      }),
    );
    return {
      invitation,
      sourceHash,
      contentHash,
      domain,
      renderedBody,
      renderedExtraMessage,
      renderedContent,
      readinessResult: { ready: true, issues: [] },
    };
  }

  private readinessInput(
    event: Event,
    invitation: InvitationWithMembers,
    template: TemplateWithAsset,
    permitDraft = false,
  ): InvitationReadinessInput {
    const locale = this.toContractLocale(template.locale);
    return {
      event: {
        id: event.id,
        name: locale === "ar-SA" ? event.nameAr : event.nameEn || event.nameAr,
        date: this.formatDate(event.eventDate, locale, event.timezone),
        time: this.formatTime(event.startTime, locale),
        venue:
          locale === "ar-SA"
            ? event.venueNameAr
            : event.venueNameEn || event.venueNameAr,
      },
      invitation: {
        id: invitation.id,
        displayName: invitation.displayName,
        phoneE164: invitation.phoneE164,
        invitationType: invitation.invitationType,
        members: invitation.members.map((member) => ({
          name: member.name,
          isPrimary: member.isPrimary,
        })),
        maxCompanions: invitation.maxCompanions,
        cancelled: Boolean(invitation.cancelledAt),
      },
      template: {
        id: template.id,
        locale,
        body: this.templateMaterial(
          template.bodyTemplate,
          template.extraMessageTemplate ?? undefined,
        ),
        approved: permitDraft || template.status === "APPROVED",
      },
    };
  }

  private computeReadiness(
    input: InvitationReadinessInput,
    template: TemplateWithAsset,
  ): {
    ready: boolean;
    issues: Array<{
      code: string;
      source: "EVENT" | "INVITATION" | "TEMPLATE";
      path: string;
      message: string;
    }>;
  } {
    const result = computeInvitationReadiness(input);
    const issues: Array<{
      code: string;
      source: "EVENT" | "INVITATION" | "TEMPLATE";
      path: string;
      message: string;
    }> = result.issues.map((issue) => ({
      code: issue.code,
      source: issue.source,
      path: issue.path,
      message: issue.message,
    }));
    if (!this.assetReady(template)) {
      issues.push({
        code: "TEMPLATE_ASSET_NOT_READY",
        source: "TEMPLATE",
        path: "template.assetId",
        message: "The selected invitation image is missing or not ready.",
      });
    }
    return { ready: result.ready && issues.length === 0, issues };
  }

  private assetReady(template: TemplateWithAsset): boolean {
    return (
      template.assetId === null ||
      (template.asset?.kind === "INVITATION_ASSET" &&
        template.asset.status === "READY" &&
        template.asset.deletedAt === null &&
        Boolean(template.asset.sha256))
    );
  }

  private sourceHash(
    event: Event,
    invitation: InvitationWithMembers,
    template: TemplateWithAsset,
  ): string {
    return invitationSourceHash(event, invitation, template);
  }

  private validateTemplateMaterial(material: string): readonly string[] {
    const validation = validateMessageTemplate(material);
    if (!validation.valid) {
      throw new BadRequestException({
        code: "TEMPLATE_PLACEHOLDERS_INVALID",
        message: "The invitation template contains invalid placeholders.",
        details: { issues: validation.issues },
      });
    }
    return validation.variables;
  }

  private templateMaterial(body: string, extraMessage?: string): string {
    return extraMessage?.trim() ? `${body}\n${extraMessage.trim()}` : body;
  }

  private templateContentHash(value: unknown): string {
    return this.sha256(this.stableSerialize(value));
  }

  private async resolveAsset(
    eventId: string,
    assetId: string | null,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<StoredAsset | null> {
    if (!assetId) return null;
    const asset = await client.storedAsset.findFirst({
      where: {
        id: assetId,
        eventId,
        kind: "INVITATION_ASSET",
        status: "READY",
        deletedAt: null,
      },
    });
    if (!asset || !asset.sha256) {
      throw new BadRequestException({
        code: "TEMPLATE_ASSET_INVALID",
        message: "The invitation image is missing, archived, or not ready.",
      });
    }
    return asset;
  }

  private findTemplate(
    client: PrismaService | Prisma.TransactionClient,
    eventId: string,
    templateId: string,
  ): Promise<TemplateWithAsset> {
    return client.invitationTemplate
      .findFirst({
        where: { id: templateId, eventId },
        include: { asset: true },
      })
      .then((template) => {
        if (!template) {
          throw new NotFoundException({
            code: "TEMPLATE_NOT_FOUND",
            message: "The template does not exist or is not accessible.",
          });
        }
        return template;
      });
  }

  private findInvitation(
    eventId: string,
    invitationId: string,
  ): Promise<InvitationWithMembers> {
    return this.prisma.invitationGroup
      .findFirst({
        where: { id: invitationId, eventId },
        include: { members: { orderBy: { position: "asc" } } },
      })
      .then((invitation) => {
        if (!invitation) {
          throw new NotFoundException({
            code: "INVITATION_NOT_FOUND",
            message: "The invitation does not exist or is not accessible.",
          });
        }
        return invitation;
      });
  }

  private sampleInvitation(
    eventId: string,
    invitationType: InvitationPreviewRequest["invitationType"],
    locale: TemplateWithAsset["locale"],
  ): InvitationWithMembers {
    const arabic = locale === "ar_SA";
    const names =
      invitationType === "NAMED_GROUP"
        ? arabic
          ? ["عبدالله", "نورة", "ريم"]
          : ["Abdullah", "Noura", "Reem"]
        : [arabic ? "سارة القحطاني" : "Sarah Al-Qahtani"];
    const now = new Date(0);
    return {
      id: "00000000-0000-4000-8000-000000000099",
      eventId,
      displayName:
        invitationType === "NAMED_GROUP"
          ? arabic
            ? "عائلة القحطاني"
            : "Al-Qahtani family"
          : names[0]!,
      contactName: names[0]!,
      phoneE164: "+966500000001",
      phoneCountry: "SA",
      invitationType,
      maxCompanions: invitationType === "PRIMARY_WITH_COMPANIONS" ? 2 : 0,
      internalNote: null,
      rsvpStatus: "PENDING",
      expectedAttendees: 0,
      createdBy: "00000000-0000-4000-8000-000000000098",
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      members: names.map((name, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 90).padStart(12, "0")}`,
        invitationGroupId: "00000000-0000-4000-8000-000000000099",
        name,
        position: index + 1,
        isPrimary: index === 0,
        createdAt: now,
        updatedAt: now,
      })),
    };
  }

  private toTemplate(template: TemplateWithAsset): InvitationTemplateContract {
    const variables = this.validateTemplateMaterial(
      this.templateMaterial(
        template.bodyTemplate,
        template.extraMessageTemplate ?? undefined,
      ),
    );
    return {
      id: template.id,
      eventId: template.eventId,
      name: template.displayName,
      locale: this.toContractLocale(template.locale),
      body: template.bodyTemplate,
      extraMessage: template.extraMessageTemplate,
      variableKeys: [
        ...variables,
      ] as InvitationTemplateContract["variableKeys"],
      assetId: template.assetId,
      assetChecksumSha256: template.asset?.sha256 ?? null,
      providerTemplateName: template.providerTemplateName,
      status: template.status,
      version: template.version,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      approvedAt: template.approvedAt?.toISOString() ?? null,
      archivedAt: template.archivedAt?.toISOString() ?? null,
    };
  }

  private toContractLocale(locale: "ar_SA" | "en"): InvitationContentLocale {
    return locale === "ar_SA"
      ? InvitationContentLocale.AR_SA
      : InvitationContentLocale.EN;
  }

  private toDatabaseLocale(locale: InvitationContentLocale): "ar_SA" | "en" {
    return locale === InvitationContentLocale.AR_SA ? "ar_SA" : "en";
  }

  private formatDate(
    date: Date,
    locale: InvitationContentLocale,
    timezone: string,
  ): string {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: timezone,
    }).format(date);
  }

  private formatTime(time: Date, locale: InvitationContentLocale): string {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(time);
  }

  private assertEventWritable(event: Event): void {
    if (event.status === "ARCHIVED") {
      throw new ConflictException({
        code: "EVENT_ARCHIVED",
        message: "Archived events are read-only.",
      });
    }
  }

  private throwTemplateArchived(): never {
    throw new ConflictException({
      code: "TEMPLATE_ARCHIVED",
      message: "An archived template version cannot be changed.",
    });
  }

  private throwTemplateVersionConflict(): never {
    throw new ConflictException({
      code: "TEMPLATE_VERSION_CONFLICT",
      message: "The template changed; refresh before trying again.",
    });
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private stableSerialize(value: unknown): string {
    return stableSerialize(value);
  }
}
