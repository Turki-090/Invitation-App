import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  DEFAULT_PERMISSION_MATRIX,
  defaultPermissionsForRole,
  effectivePermissions,
  hasPermission,
  NON_DELEGABLE_PERMISSIONS,
  Permission,
  resolvePermissions,
  type Permission as PermissionValue,
} from "./permissions";
import { MembershipRole } from "./types";

describe("permission catalog and defaults", () => {
  it("exports every permission exactly once in canonical order", () => {
    expect(ALL_PERMISSIONS).toEqual(Object.values(Permission));
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it("exports a complete matrix containing only catalog permissions", () => {
    expect(Object.keys(DEFAULT_PERMISSION_MATRIX).sort()).toEqual(
      Object.values(MembershipRole).sort(),
    );

    for (const defaults of Object.values(DEFAULT_PERMISSION_MATRIX)) {
      expect(new Set(defaults).size).toBe(defaults.length);
      expect(
        defaults.every((permission) => ALL_PERMISSIONS.includes(permission)),
      ).toBe(true);
    }
    expect(DEFAULT_PERMISSION_MATRIX[MembershipRole.OWNER]).toEqual(
      ALL_PERMISSIONS,
    );
  });

  it.each(Object.values(MembershipRole))(
    "returns the exported defaults for %s",
    (role) => {
      expect(defaultPermissionsForRole(role)).toBe(
        DEFAULT_PERMISSION_MATRIX[role],
      );
    },
  );

  it("keeps the intended co-host and check-in defaults exhaustive", () => {
    expect(DEFAULT_PERMISSION_MATRIX[MembershipRole.CO_HOST]).toEqual([
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
    ]);
    expect(DEFAULT_PERMISSION_MATRIX[MembershipRole.CHECK_IN_STAFF]).toEqual([
      Permission.EVENT_VIEW,
      Permission.GUEST_VIEW,
      Permission.CHECKIN_USE,
    ]);
  });
});

describe("resolvePermissions", () => {
  it.each(Object.values(MembershipRole))(
    "resolves every default consistently for %s",
    (role) => {
      const resolved = effectivePermissions(role);
      expect(resolvePermissions(role)).toEqual(resolved);
      for (const permission of ALL_PERMISSIONS) {
        expect(hasPermission(role, permission)).toBe(
          resolved.includes(permission),
        );
      }
    },
  );

  it("treats legacy arrays as additive role overrides", () => {
    const resolved = resolvePermissions(MembershipRole.CHECK_IN_STAFF, [
      Permission.REMINDER_SEND,
      Permission.EVENT_VIEW,
      Permission.REMINDER_SEND,
    ]);

    expect(resolved).toEqual([
      Permission.EVENT_VIEW,
      Permission.GUEST_VIEW,
      Permission.REMINDER_SEND,
      Permission.CHECKIN_USE,
    ]);
    expect(
      hasPermission(MembershipRole.CHECK_IN_STAFF, Permission.REMINDER_SEND, [
        Permission.REMINDER_SEND,
      ]),
    ).toBe(true);
    expect(
      hasPermission(MembershipRole.CHECK_IN_STAFF, Permission.GUEST_VIEW, []),
    ).toBe(true);
  });

  it("supports delegable capabilities as legacy additive overrides", () => {
    for (const role of [
      MembershipRole.CO_HOST,
      MembershipRole.CHECK_IN_STAFF,
    ] as const) {
      for (const permission of ALL_PERMISSIONS) {
        expect(hasPermission(role, permission, [permission])).toBe(
          !NON_DELEGABLE_PERMISSIONS.includes(
            permission as (typeof NON_DELEGABLE_PERMISSIONS)[number],
          ),
        );
      }
    }
  });

  it("treats CUSTOM permissions as an exact allow-list", () => {
    const custom = {
      mode: "CUSTOM",
      permissions: [Permission.EVENT_VIEW, Permission.TEAM_MANAGE],
    } as const;

    expect(resolvePermissions(MembershipRole.CO_HOST, custom)).toEqual([
      Permission.EVENT_VIEW,
      Permission.TEAM_MANAGE,
    ]);
    expect(
      hasPermission(MembershipRole.CO_HOST, Permission.TEAM_MANAGE, custom),
    ).toBe(true);
    expect(
      hasPermission(MembershipRole.CO_HOST, Permission.INVITATION_SEND, custom),
    ).toBe(false);
  });

  it("allows an empty CUSTOM configuration to remove every non-owner capability", () => {
    const emptyCustom = { mode: "CUSTOM", permissions: [] } as const;

    for (const permission of ALL_PERMISSIONS) {
      expect(
        hasPermission(MembershipRole.CO_HOST, permission, emptyCustom),
      ).toBe(false);
      expect(
        hasPermission(MembershipRole.CHECK_IN_STAFF, permission, emptyCustom),
      ).toBe(false);
    }
  });

  it("supports every delegable capability in an exact CUSTOM allow-list", () => {
    for (const role of [
      MembershipRole.CO_HOST,
      MembershipRole.CHECK_IN_STAFF,
    ] as const) {
      for (const selectedPermission of ALL_PERMISSIONS) {
        const configuration = {
          mode: "CUSTOM",
          permissions: [selectedPermission],
        } as const;
        const delegable = !NON_DELEGABLE_PERMISSIONS.includes(
          selectedPermission as (typeof NON_DELEGABLE_PERMISSIONS)[number],
        );
        expect(effectivePermissions(role, configuration)).toEqual(
          delegable ? [selectedPermission] : [],
        );
        for (const candidate of ALL_PERMISSIONS) {
          expect(hasPermission(role, candidate, configuration)).toBe(
            delegable && candidate === selectedPermission,
          );
        }
      }
    }
  });

  it("keeps the owner bypass for default, legacy, and CUSTOM configurations", () => {
    const configurations = [
      undefined,
      [] as readonly PermissionValue[],
      [Permission.EVENT_VIEW] as readonly PermissionValue[],
      { mode: "CUSTOM", permissions: [] } as const,
    ];

    for (const configuration of configurations) {
      for (const permission of ALL_PERMISSIONS) {
        expect(
          hasPermission(MembershipRole.OWNER, permission, configuration ?? []),
        ).toBe(true);
      }
    }
  });

  it("deduplicates CUSTOM entries and returns catalog order", () => {
    expect(
      resolvePermissions(MembershipRole.CO_HOST, {
        mode: "CUSTOM",
        permissions: [
          Permission.TEAM_MANAGE,
          Permission.EVENT_VIEW,
          Permission.TEAM_MANAGE,
        ],
      }),
    ).toEqual([Permission.EVENT_VIEW, Permission.TEAM_MANAGE]);
  });
});
