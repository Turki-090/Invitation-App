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

/**
 * Canonical permission order used by API contracts and team-management UIs.
 * Keep additions in the same order as `Permission` above.
 */
export const ALL_PERMISSIONS = [
  Permission.EVENT_VIEW,
  Permission.EVENT_EDIT,
  Permission.GUEST_VIEW,
  Permission.GUEST_PHONE_VIEW,
  Permission.GUEST_CREATE,
  Permission.GUEST_EDIT,
  Permission.GUEST_DELETE,
  Permission.GUEST_IMPORT,
  Permission.GUEST_EXPORT,
  Permission.INVITATION_SEND,
  Permission.INVITATION_RESEND,
  Permission.REMINDER_SEND,
  Permission.RSVP_EDIT,
  Permission.REPORTS_VIEW,
  Permission.CHECKIN_USE,
  Permission.TEAM_MANAGE,
  Permission.BILLING_MANAGE,
  Permission.EVENT_ARCHIVE,
  Permission.EVENT_DELETE,
] as const satisfies readonly Permission[];

/** Capabilities that cannot be delegated to a non-owner membership. */
export const NON_DELEGABLE_PERMISSIONS = [
  Permission.BILLING_MANAGE,
  Permission.EVENT_DELETE,
] as const satisfies readonly Permission[];

export const PermissionConfigurationMode = {
  CUSTOM: "CUSTOM",
} as const;

export type PermissionConfigurationMode =
  (typeof PermissionConfigurationMode)[keyof typeof PermissionConfigurationMode];

/**
 * A persisted array is the legacy representation: its entries are additive to
 * the role defaults. `CUSTOM` is deliberately different and represents the
 * member's complete allow-list, so omitting a role default removes it.
 */
export interface CustomPermissionConfiguration {
  readonly mode: typeof PermissionConfigurationMode.CUSTOM;
  readonly permissions: readonly Permission[];
}

export type LegacyAdditivePermissionConfiguration = readonly Permission[];

export type PermissionConfiguration =
  LegacyAdditivePermissionConfiguration | CustomPermissionConfiguration;

export const DEFAULT_PERMISSION_MATRIX = Object.freeze({
  [MembershipRole.OWNER]: ALL_PERMISSIONS,
  [MembershipRole.CO_HOST]: Object.freeze([
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
  [MembershipRole.CHECK_IN_STAFF]: Object.freeze([
    Permission.EVENT_VIEW,
    Permission.GUEST_VIEW,
    Permission.CHECKIN_USE,
  ]),
}) satisfies Readonly<Record<MembershipRole, readonly Permission[]>>;

export function defaultPermissionsForRole(
  role: MembershipRole,
): readonly Permission[] {
  return DEFAULT_PERMISSION_MATRIX[role];
}

/** Returns effective capabilities in the stable catalog order. */
export function effectivePermissions(
  role: MembershipRole,
  configuration: PermissionConfiguration = [],
): readonly Permission[] {
  if (role === MembershipRole.OWNER) return ALL_PERMISSIONS;

  const configured = isCustomPermissionConfiguration(configuration)
    ? configuration.permissions
    : [...defaultPermissionsForRole(role), ...configuration];
  const allowed = new Set(configured);
  for (const permission of NON_DELEGABLE_PERMISSIONS) {
    allowed.delete(permission);
  }
  return ALL_PERMISSIONS.filter((permission) => allowed.has(permission));
}

/** Compatibility name for existing and early Stage 8 consumers. */
export function resolvePermissions(
  role: MembershipRole,
  configuration: PermissionConfiguration = [],
): readonly Permission[] {
  return effectivePermissions(role, configuration);
}

export function hasPermission(
  role: MembershipRole,
  permission: Permission,
  configuration: PermissionConfiguration = [],
): boolean {
  if (role === MembershipRole.OWNER) return true;
  return effectivePermissions(role, configuration).includes(permission);
}

export function isCustomPermissionConfiguration(
  configuration: PermissionConfiguration,
): configuration is CustomPermissionConfiguration {
  return (
    "mode" in configuration &&
    configuration.mode === PermissionConfigurationMode.CUSTOM
  );
}
