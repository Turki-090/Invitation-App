import { Inject, Injectable } from "@nestjs/common";
import type { CreateEventInput, EventSummary } from "@dawah/api-contract";
import type { Event, EventMembershipRole, Prisma, User } from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

type EventWithRole = Event & {
  memberships: Array<{ role: EventMembershipRole }>;
};

@Injectable()
export class EventsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  public async list(principal: AuthPrincipal): Promise<EventSummary[]> {
    const user = await this.ensureUser(principal);
    const events = await this.prisma.event.findMany({
      where: {
        memberships: { some: { userId: user.id, status: "ACTIVE" } },
        archivedAt: null,
      },
      include: {
        memberships: { where: { userId: user.id }, select: { role: true } },
      },
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
    });
    return events.map((event) => this.toSummary(event));
  }

  public async create(
    principal: AuthPrincipal,
    input: CreateEventInput,
  ): Promise<EventSummary> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await this.ensureUser(principal, transaction);
      const event = await transaction.event.create({
        data: {
          ownerUserId: user.id,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          eventType: input.eventType,
          eventDate: this.dateOnly(input.eventDate),
          startTime: this.timeOnly(input.startTime),
          endTime: input.endTime ? this.timeOnly(input.endTime) : null,
          timezone: input.timezone,
          venueNameAr: input.venueNameAr,
          venueNameEn: input.venueNameEn,
          city: input.city,
          mapUrl: input.mapUrl,
          rsvpDeadline: input.rsvpDeadline
            ? this.dateOnly(input.rsvpDeadline)
            : null,
          allowRsvpEdits: input.allowRsvpEdits,
          memberships: {
            create: {
              userId: user.id,
              role: "OWNER",
              status: "ACTIVE",
              acceptedAt: new Date(),
            },
          },
        },
        include: {
          memberships: { where: { userId: user.id }, select: { role: true } },
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId: event.id,
          actorUserId: user.id,
          actorType: "USER",
          action: "event.created",
          targetType: "Event",
          targetId: event.id,
          metadata: { status: event.status },
        },
      });
      return this.toSummary(event);
    });
  }

  private ensureUser(
    principal: AuthPrincipal,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<User> {
    return client.user.upsert({
      where: { authProviderId: principal.subject },
      create: {
        authProviderId: principal.subject,
        email: principal.email,
        phoneE164: principal.phone,
      },
      update: {
        ...(principal.email ? { email: principal.email } : {}),
        ...(principal.phone ? { phoneE164: principal.phone } : {}),
      },
    });
  }

  private toSummary(event: EventWithRole): EventSummary {
    const membership = event.memberships[0];
    if (!membership)
      throw new Error(
        "Event membership is missing from an authorized event query.",
      );
    return {
      id: event.id,
      nameAr: event.nameAr,
      nameEn: event.nameEn,
      eventType: event.eventType,
      eventDate: event.eventDate.toISOString().slice(0, 10),
      timezone: event.timezone,
      venueNameAr: event.venueNameAr,
      city: event.city,
      status: event.status,
      role: membership.role,
    };
  }

  private dateOnly(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private timeOnly(value: string): Date {
    return new Date(`1970-01-01T${value}:00.000Z`);
  }
}
