import { createHash } from "node:crypto";

interface SourceEvent {
  readonly id: string;
  readonly nameAr: string;
  readonly nameEn: string | null;
  readonly eventDate: Date;
  readonly startTime: Date;
  readonly venueNameAr: string;
  readonly venueNameEn: string | null;
  readonly timezone: string;
}

interface SourceMember {
  readonly name: string;
  readonly isPrimary: boolean;
  readonly position: number;
}

interface SourceInvitation {
  readonly id: string;
  readonly displayName: string;
  readonly phoneE164: string;
  readonly invitationType: string;
  readonly maxCompanions: number;
  readonly cancelledAt: Date | null;
  readonly members: readonly SourceMember[];
}

interface SourceTemplate {
  readonly id: string;
  readonly version: number;
  readonly locale: string;
  readonly status: string;
  readonly contentHash: string;
  readonly provider: string;
  readonly providerTemplateName: string | null;
  readonly assetId: string | null;
  readonly asset: { readonly sha256: string | null } | null;
}

export function invitationSourceHash(
  event: SourceEvent,
  invitation: SourceInvitation,
  template: SourceTemplate,
): string {
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
        assetSha256: template.asset?.sha256 ?? null,
      },
    }),
  );
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
