import { ALL_PERMISSIONS, normalizePhoneNumber } from "@dawah/domain";
import { z } from "zod";
import { gccPhoneCountrySchema } from "./invitations";

export const nonOwnerMembershipRoleSchema = z.enum([
  "CO_HOST",
  "CHECK_IN_STAFF",
]);
export const membershipRoleSchema = z.enum([
  "OWNER",
  "CO_HOST",
  "CHECK_IN_STAFF",
]);
export const membershipStatusSchema = z.enum(["PENDING", "ACTIVE", "REVOKED"]);
export const teamInvitationStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
]);
export const permissionSchema = z.enum(ALL_PERMISSIONS);
export const permissionModeSchema = z.enum(["DEFAULT", "CUSTOM"]);

export const permissionConfigurationSchema = z
  .object({
    mode: permissionModeSchema.default("DEFAULT"),
    permissions: z
      .array(permissionSchema)
      .max(ALL_PERMISSIONS.length)
      .default([]),
  })
  .superRefine((value, context) => {
    if (value.mode === "DEFAULT" && value.permissions.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Default role permissions cannot include a custom allow-list.",
        path: ["permissions"],
      });
    }
    if (new Set(value.permissions).size !== value.permissions.length) {
      context.addIssue({
        code: "custom",
        message: "Permissions must be unique.",
        path: ["permissions"],
      });
    }
  });

export type PermissionConfigurationInput = z.infer<
  typeof permissionConfigurationSchema
>;

export const teamMemberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  permissionMode: permissionModeSchema,
  configuredPermissions: z.array(permissionSchema),
  effectivePermissions: z.array(permissionSchema),
  invitedByUserId: z.uuid().nullable(),
  acceptedAt: z.string().nullable(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamInvitationSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  maskedPhone: z.string(),
  phoneCountry: gccPhoneCountrySchema,
  role: nonOwnerMembershipRoleSchema,
  status: teamInvitationStatusSchema,
  permissionMode: permissionModeSchema,
  configuredPermissions: z.array(permissionSchema),
  effectivePermissions: z.array(permissionSchema),
  invitedByUserId: z.uuid(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TeamInvitation = z.infer<typeof teamInvitationSchema>;

export const teamOverviewSchema = z.object({
  eventId: z.uuid(),
  members: z.array(teamMemberSchema),
  invitations: z.array(teamInvitationSchema),
});
export type TeamOverview = z.infer<typeof teamOverviewSchema>;

export const createTeamInvitationSchema = z
  .object({
    phoneNumber: z.string().trim().min(3).max(40),
    phoneCountry: gccPhoneCountrySchema.default("SA"),
    role: nonOwnerMembershipRoleSchema,
    permissionConfiguration: permissionConfigurationSchema.default({
      mode: "DEFAULT",
      permissions: [],
    }),
  })
  .superRefine((value, context) => {
    try {
      normalizePhoneNumber(value.phoneNumber, value.phoneCountry);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? error.message
            : "The phone number is invalid.",
        path: ["phoneNumber"],
      });
    }
  });
export type CreateTeamInvitationInput = z.infer<
  typeof createTeamInvitationSchema
>;

export const teamInvitationCredentialSchema = teamInvitationSchema.extend({
  acceptanceToken: z
    .string()
    .min(43)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export type TeamInvitationCredential = z.infer<
  typeof teamInvitationCredentialSchema
>;

export const updateTeamMemberSchema = z
  .object({
    role: nonOwnerMembershipRoleSchema.optional(),
    permissionConfiguration: permissionConfigurationSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide a role or permission configuration to update.",
  });
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

export const acceptTeamInvitationSchema = z.object({
  token: z
    .string()
    .min(43)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export type AcceptTeamInvitationInput = z.infer<
  typeof acceptTeamInvitationSchema
>;

export const acceptTeamInvitationResultSchema = z.object({
  eventId: z.uuid(),
  membership: teamMemberSchema,
  alreadyAccepted: z.boolean(),
});
export type AcceptTeamInvitationResult = z.infer<
  typeof acceptTeamInvitationResultSchema
>;
