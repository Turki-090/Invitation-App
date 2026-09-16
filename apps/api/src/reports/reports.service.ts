import { Inject, Injectable } from "@nestjs/common";
import type { EventReport } from "@dawah/api-contract";
import { Permission } from "@dawah/domain";
import { Prisma, type EventStatus, type PrismaClient } from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { PrismaService } from "../prisma/prisma.service";

type ReportClient = Pick<
  PrismaClient,
  "invitationGroup" | "guestMember" | "message" | "checkInState"
>;

const RSVP_STATUSES = [
  "ACCEPTED",
  "PARTIALLY_ACCEPTED",
  "DECLINED",
  "PENDING",
] as const;
const INVITATION_TYPES = [
  "SINGLE",
  "NAMED_GROUP",
  "PRIMARY_WITH_COMPANIONS",
] as const;
const MESSAGE_STATUSES = [
  "QUEUED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "RESPONDED",
  "FAILED",
  "CANCELLED",
] as const;

@Injectable()
export class ReportsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
  ) {}

  public get(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<EventReport> {
    return this.prisma.$transaction(
      async (transaction) => {
        const { event } = await this.access.resolve(
          principal,
          eventId,
          Permission.REPORTS_VIEW,
          transaction,
        );
        return this.aggregate(transaction, eventId, event.status);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async aggregate(
    client: ReportClient,
    eventId: string,
    eventStatus: EventStatus,
  ): Promise<EventReport> {
    const activeInvitationWhere = { eventId, cancelledAt: null } as const;
    const activeMessageWhere = {
      eventId,
      invitationGroup: { cancelledAt: null },
    } as const;
    const [
      activeGroups,
      cancelledGroups,
      namedGuests,
      rsvpGroups,
      invitationTypeGroups,
      initialInvitationGroups,
      latestInvitationMessages,
      checkIn,
    ] = await Promise.all([
      client.invitationGroup.aggregate({
        where: activeInvitationWhere,
        _count: { _all: true },
        _sum: { expectedAttendees: true },
      }),
      client.invitationGroup.count({
        where: { eventId, cancelledAt: { not: null } },
      }),
      client.guestMember.count({
        where: { invitationGroup: activeInvitationWhere },
      }),
      client.invitationGroup.groupBy({
        by: ["rsvpStatus"],
        where: activeInvitationWhere,
        orderBy: { rsvpStatus: "asc" },
        _count: true,
      }),
      client.invitationGroup.groupBy({
        by: ["invitationType"],
        where: activeInvitationWhere,
        orderBy: { invitationType: "asc" },
        _count: true,
      }),
      client.message.count({
        where: {
          ...activeMessageWhere,
          messageType: "INVITATION",
          predecessorMessageId: null,
        },
      }),
      client.message.findMany({
        where: { ...activeMessageWhere, messageType: "INVITATION" },
        distinct: ["invitationGroupId"],
        orderBy: [
          { invitationGroupId: "asc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        select: { status: true },
      }),
      client.checkInState.aggregate({
        where: {
          eventId,
          checkedInCount: { gt: 0 },
          invitationGroup: { cancelledAt: null },
        },
        _count: { _all: true },
        _sum: { checkedInCount: true },
      }),
    ] as const);

    const activeGroupCount = activeGroups._count._all;
    const expectedAttendance = activeGroups._sum.expectedAttendees ?? 0;
    const checkedInAttendees = checkIn._sum.checkedInCount ?? 0;
    const notArrivedAttendees = Math.max(
      expectedAttendance - checkedInAttendees,
      0,
    );
    const rsvpCount = countBy(rsvpGroups, "rsvpStatus");
    const invitationTypeCount = countBy(
      invitationTypeGroups,
      "invitationType",
    );
    const latestMessageCounts = new Map<string, number>();
    for (const message of latestInvitationMessages) {
      latestMessageCounts.set(
        message.status,
        (latestMessageCounts.get(message.status) ?? 0) + 1,
      );
    }
    const messageCount = (status: string) => latestMessageCounts.get(status) ?? 0;

    return {
      eventId,
      generatedAt: new Date().toISOString(),
      invitationGroups: {
        active: activeGroupCount,
        cancelled: cancelledGroups,
        withInitialInvitation: initialInvitationGroups,
        withoutInitialInvitation: Math.max(
          activeGroupCount - initialInvitationGroups,
          0,
        ),
      },
      namedGuests,
      expectedAttendance,
      rsvp: {
        acceptedGroups: rsvpCount(RSVP_STATUSES[0]),
        partiallyAcceptedGroups: rsvpCount(RSVP_STATUSES[1]),
        declinedGroups: rsvpCount(RSVP_STATUSES[2]),
        pendingGroups: rsvpCount(RSVP_STATUSES[3]),
      },
      invitationTypes: {
        singleGroups: invitationTypeCount(INVITATION_TYPES[0]),
        namedGroupGroups: invitationTypeCount(INVITATION_TYPES[1]),
        primaryWithCompanionsGroups: invitationTypeCount(INVITATION_TYPES[2]),
      },
      delivery: {
        latestInvitationMessages: latestInvitationMessages.length,
        notSentGroups: Math.max(
          activeGroupCount - latestInvitationMessages.length,
          0,
        ),
        byStatus: {
          queued: messageCount(MESSAGE_STATUSES[0]),
          sending: messageCount(MESSAGE_STATUSES[1]),
          sent: messageCount(MESSAGE_STATUSES[2]),
          delivered: messageCount(MESSAGE_STATUSES[3]),
          read: messageCount(MESSAGE_STATUSES[4]),
          responded: messageCount(MESSAGE_STATUSES[5]),
          failed: messageCount(MESSAGE_STATUSES[6]),
          cancelled: messageCount(MESSAGE_STATUSES[7]),
        },
      },
      checkIn: {
        checkedInGroups: checkIn._count._all,
        checkedInAttendees,
        notArrivedAttendees,
        noShowAttendees:
          eventStatus === "COMPLETED" ? notArrivedAttendees : null,
      },
    };
  }
}

function countBy<
  Row extends Record<Key, string> & { readonly _count: number },
  Key extends keyof Row,
>(rows: readonly Row[], key: Key): (value: Row[Key]) => number {
  const counts = new Map(rows.map((row) => [row[key], row._count] as const));
  return (value) => counts.get(value) ?? 0;
}
