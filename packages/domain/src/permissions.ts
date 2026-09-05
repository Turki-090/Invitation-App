import { MembershipRole } from "./types";

export const Permission = {
  EVENT_VIEW: "event.view",
  EVENT_EDIT: "event.edit",
  GUEST_VIEW: "guest.view",
  GUEST_PHONE_VIEW: "guest.phone.view",
  GUEST_CREATE: "guest.create",
  GUEST_EDIT: "guest.edit",
  GUEST_DELETE: "guest.delete",
  GUEST_IMPORT: "guest.import",
  GUEST_EXPORT: "guest.export",
  INVITATION_SEND: "invitation.send",
  INVITATION_RESEND: "invitation.resend",
  REMINDER_SEND: "reminder.send",
  RSVP_EDIT: "rsvp.edit",
  REPORTS_VIEW: "reports.view",
  CHECKIN_USE: "checkin.use",
  TEAM_MANAGE: "team.manage",
  BILLING_MANAGE: "billing.manage",
  EVENT_ARCHIVE: "event.archive",
  EVENT_DELETE: "event.delete",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const defaultPermissions: Record<
  Exclude<MembershipRole, "OWNER">,
  ReadonlySet<Permission>
> = {
  [MembershipRole.CO_HOST]: new Set([
    Permission.EVENT_VIEW,
    Permission.GUEST_VIEW,
    Permission.GUEST_PHONE_VIEW,
    Permission.GUEST_CREATE,
    Permission.GUEST_EDIT,
    Permission.INVITATION_SEND,
    Permission.INVITATION_RESEND,
    Permission.REMINDER_SEND,
    Permission.RSVP_EDIT,
    Permission.REPORTS_VIEW,
  ]),
  [MembershipRole.CHECK_IN_STAFF]: new Set([
    Permission.EVENT_VIEW,
    Permission.GUEST_VIEW,
    Permission.CHECKIN_USE,
  ]),
};

export function hasPermission(
  role: MembershipRole,
  permission: Permission,
  overrides: readonly Permission[] = [],
): boolean {
  if (role === MembershipRole.OWNER) return true;
  return new Set([...defaultPermissions[role], ...overrides]).has(permission);
}
