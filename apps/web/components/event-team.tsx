"use client";

import {
  permissionSchema,
  type CreateTeamInvitationInput,
  type TeamInvitation,
  type TeamInvitationCredential,
  type TeamMember,
} from "@dawah/api-contract";
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Phone,
  PhoneInput,
  Select,
  Tag,
  Toast,
} from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import {
  createTeamInvitation,
  getTeamOverview,
  resendTeamInvitation,
  revokeTeamInvitation,
  revokeTeamMember,
  updateTeamMember,
} from "../lib/api";
import type { getSupabaseClient } from "../lib/supabase";

interface EventTeamProps {
  common: Dictionary["common"];
  copy: Dictionary["team"];
  eventId: string;
  locale: AppLocale;
  supabase: ReturnType<typeof getSupabaseClient>;
}

type TeamRole = CreateTeamInvitationInput["role"];
type PhoneCountry = CreateTeamInvitationInput["phoneCountry"];
type PermissionMode =
  CreateTeamInvitationInput["permissionConfiguration"]["mode"];
type Permission = (typeof permissionSchema.options)[number];

const NON_DELEGABLE_PERMISSIONS = new Set<Permission>([
  "billing.manage",
  "event.delete",
]);
const DELEGABLE_PERMISSIONS = permissionSchema.options.filter(
  (permission) => !NON_DELEGABLE_PERMISSIONS.has(permission),
);

export function EventTeam({
  common,
  copy,
  eventId,
  locale,
  supabase,
}: EventTeamProps) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>("SA");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("CO_HOST");
  const [inviteMode, setInviteMode] = useState<PermissionMode>("DEFAULT");
  const [invitePermissions, setInvitePermissions] = useState<Permission[]>([]);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState<TeamRole>("CO_HOST");
  const [editMode, setEditMode] = useState<PermissionMode>("DEFAULT");
  const [editPermissions, setEditPermissions] = useState<Permission[]>([]);
  const [revokingMember, setRevokingMember] = useState<TeamMember | null>(null);
  const [inviteCredential, setInviteCredential] =
    useState<TeamInvitationCredential | null>(null);
  const [notice, setNotice] = useState("");

  const team = useQuery({
    queryKey: ["events", eventId, "team"],
    queryFn: () => getTeamOverview(supabase, eventId),
  });
  const pendingInvitations = useMemo(
    () =>
      (team.data?.invitations ?? []).filter(
        (invitation) => invitation.status === "PENDING",
      ),
    [team.data?.invitations],
  );

  const refreshTeam = () =>
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "team"] });

  const invite = useMutation({
    mutationFn: () =>
      createTeamInvitation(supabase, eventId, {
        permissionConfiguration: {
          mode: inviteMode,
          permissions: inviteMode === "CUSTOM" ? invitePermissions : [],
        },
        phoneCountry,
        phoneNumber: phoneNumber.trim(),
        role: inviteRole,
      }),
    onSuccess: async (credential) => {
      setInviteOpen(false);
      setPhoneNumber("");
      setInviteMode("DEFAULT");
      setInvitePermissions([]);
      setInviteCredential(credential);
      setNotice(copy.inviteSent);
      await refreshTeam();
    },
  });

  const invitationAction = useMutation({
    mutationFn: ({
      invitation,
      kind,
    }: {
      invitation: TeamInvitation;
      kind: "resend" | "revoke";
    }) =>
      kind === "resend"
        ? resendTeamInvitation(supabase, eventId, invitation.id)
        : revokeTeamInvitation(supabase, eventId, invitation.id),
    onSuccess: async (result, variables) => {
      if (
        "acceptanceToken" in result &&
        typeof result.acceptanceToken === "string"
      ) {
        setInviteCredential({
          ...result,
          acceptanceToken: result.acceptanceToken,
        });
      }
      setNotice(
        variables.kind === "resend" ? copy.inviteResent : copy.inviteRevoked,
      );
      await refreshTeam();
    },
  });

  const updateMember = useMutation({
    mutationFn: () => {
      if (!editingMember) throw new Error("No membership selected");
      return updateTeamMember(supabase, eventId, editingMember.id, {
        permissionConfiguration: {
          mode: editMode,
          permissions: editMode === "CUSTOM" ? editPermissions : [],
        },
        role: editRole,
      });
    },
    onSuccess: async (member) => {
      setEditingMember(null);
      setNotice(
        interpolate(copy.memberUpdated, { name: memberName(member, copy) }),
      );
      await refreshTeam();
    },
  });

  const invitationPath = inviteCredential
    ? `/${locale}/team-invitations/${inviteCredential.acceptanceToken}`
    : "";
  const invitationUrl = inviteCredential
    ? typeof window === "undefined"
      ? invitationPath
      : new URL(invitationPath, window.location.origin).toString()
    : "";
  const copyInvitationLink = async () => {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setNotice(copy.inviteLinkCopied);
    } catch {
      setNotice(copy.inviteLinkCopyError);
    }
  };

  const revokeMember = useMutation({
    mutationFn: () => {
      if (!revokingMember) throw new Error("No membership selected");
      return revokeTeamMember(supabase, eventId, revokingMember.id);
    },
    onSuccess: async (member) => {
      setRevokingMember(null);
      setNotice(
        interpolate(copy.memberRevoked, { name: memberName(member, copy) }),
      );
      await refreshTeam();
    },
  });

  return (
    <div className="team-page">
      <header className="workspace-page-header team-page-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <Button icon="user-plus" onClick={() => setInviteOpen(true)}>
          {copy.invite}
        </Button>
      </header>

      {team.isLoading ? (
        <TeamLoading label={copy.loading} />
      ) : team.isError || !team.data ? (
        <EmptyState
          action={
            <Button onClick={() => team.refetch()} variant="secondary">
              {copy.retry}
            </Button>
          }
          description={copy.loadError}
          icon="circle-alert"
          title={copy.loadError}
        />
      ) : (
        <div className="team-grid">
          <Card title={copy.membersTitle}>
            <div className="team-member-list">
              {team.data.members.map((member) => {
                const name = memberName(member, copy);
                const editable =
                  member.role !== "OWNER" && member.status === "ACTIVE";
                return (
                  <article className="team-member" key={member.id}>
                    <Avatar name={name} size="lg" />
                    <div className="team-member__identity">
                      <strong>{name}</strong>
                      {member.email ? <small>{member.email}</small> : null}
                      <div className="team-member__meta">
                        <Tag size="sm" tone="outline">
                          {roleLabel(member.role, copy)}
                        </Tag>
                        <Tag
                          size="sm"
                          tone={
                            member.status === "ACTIVE" ? "accent" : "neutral"
                          }
                        >
                          {memberStatusLabel(member.status, copy)}
                        </Tag>
                      </div>
                      <small>
                        {member.permissionMode === "DEFAULT"
                          ? copy.defaultPermissions
                          : interpolate(copy.permissionsCount, {
                              count: formatNumber(
                                member.effectivePermissions.length,
                                locale,
                              ),
                            })}
                      </small>
                    </div>
                    {editable ? (
                      <div className="team-member__actions">
                        <IconButton
                          label={interpolate(copy.editMember, { name })}
                          name="pencil"
                          onClick={() => {
                            updateMember.reset();
                            setEditingMember(member);
                            setEditRole(member.role as TeamRole);
                            setEditMode(member.permissionMode);
                            setEditPermissions(
                              member.configuredPermissions.filter(isDelegable),
                            );
                          }}
                          size="sm"
                          variant="outline"
                        />
                        <IconButton
                          label={interpolate(copy.revokeMember, { name })}
                          name="user-x"
                          onClick={() => {
                            revokeMember.reset();
                            setRevokingMember(member);
                          }}
                          size="sm"
                          variant="outline"
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </Card>

          <Card title={copy.pendingTitle}>
            {pendingInvitations.length ? (
              <div className="team-invitation-list">
                {pendingInvitations.map((invitation) => (
                  <article className="team-invitation" key={invitation.id}>
                    <div className="team-invitation__details">
                      <Phone value={invitation.maskedPhone} />
                      <span>{roleLabel(invitation.role, copy)}</span>
                      <small>
                        {interpolate(copy.expiresAt, {
                          date: formatDateTime(invitation.expiresAt, locale),
                        })}
                      </small>
                    </div>
                    <div className="team-invitation__actions">
                      <Button
                        disabled={invitationAction.isPending}
                        onClick={() =>
                          invitationAction.mutate({
                            invitation,
                            kind: "resend",
                          })
                        }
                        size="sm"
                        variant="secondary"
                      >
                        {copy.resendInvite}
                      </Button>
                      <Button
                        disabled={invitationAction.isPending}
                        onClick={() =>
                          invitationAction.mutate({
                            invitation,
                            kind: "revoke",
                          })
                        }
                        size="sm"
                        variant="danger-soft"
                      >
                        {copy.revokeInvite}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                description={copy.noPending}
                icon="user-plus"
                title={copy.noPending}
              />
            )}
            {invitationAction.isError ? (
              <p className="form-error" role="alert">
                {copy.invitationActionError}
              </p>
            ) : null}
          </Card>
        </div>
      )}

      <Dialog
        closeLabel={common.close}
        description={copy.inviteDialogDescription}
        footer={
          <>
            <Button onClick={() => setInviteOpen(false)} variant="secondary">
              {common.cancel}
            </Button>
            <Button
              disabled={phoneNumber.trim().length < 3}
              loading={invite.isPending}
              onClick={() => invite.mutate()}
            >
              {copy.sendInvite}
            </Button>
          </>
        }
        onClose={() => setInviteOpen(false)}
        open={inviteOpen}
        title={copy.inviteDialogTitle}
      >
        <div className="team-form">
          <Field id="team-phone-country" label={copy.phoneCountry}>
            <Select
              id="team-phone-country"
              onChange={(event) => {
                setPhoneCountry(event.currentTarget.value as PhoneCountry);
                setPhoneNumber("");
              }}
              options={countryOptions(copy)}
              value={phoneCountry}
            />
          </Field>
          <Field
            hint={copy.phoneHint}
            id="team-phone-number"
            label={copy.phoneNumber}
            required
          >
            <PhoneInput
              countryCode={dialCode(phoneCountry)}
              id="team-phone-number"
              onChange={(event) => setPhoneNumber(event.currentTarget.value)}
              value={phoneNumber}
            />
          </Field>
          <Field id="team-role" label={copy.role}>
            <Select
              id="team-role"
              onChange={(event) =>
                setInviteRole(event.currentTarget.value as TeamRole)
              }
              options={roleOptions(copy)}
              value={inviteRole}
            />
          </Field>
          <PermissionConfigurationFields
            copy={copy}
            idPrefix="team-invite"
            mode={inviteMode}
            onModeChange={setInviteMode}
            onPermissionsChange={setInvitePermissions}
            permissions={invitePermissions}
          />
          {invite.isError ? (
            <p className="form-error" role="alert">
              {copy.inviteError}
            </p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        closeLabel={common.close}
        description={copy.inviteLinkDescription}
        footer={
          <>
            <Button
              onClick={() => setInviteCredential(null)}
              variant="secondary"
            >
              {common.close}
            </Button>
            <Button icon="copy" onClick={copyInvitationLink}>
              {copy.copyInviteLink}
            </Button>
          </>
        }
        onClose={() => setInviteCredential(null)}
        open={Boolean(inviteCredential)}
        title={copy.inviteLinkTitle}
      >
        <Field id="team-invitation-link" label={copy.inviteLinkLabel}>
          <Input
            id="team-invitation-link"
            mono
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={invitationUrl}
          />
        </Field>
      </Dialog>

      <Dialog
        closeLabel={common.close}
        footer={
          <>
            <Button onClick={() => setEditingMember(null)} variant="secondary">
              {common.cancel}
            </Button>
            <Button
              loading={updateMember.isPending}
              onClick={() => updateMember.mutate()}
            >
              {copy.saveChanges}
            </Button>
          </>
        }
        onClose={() => setEditingMember(null)}
        open={Boolean(editingMember)}
        title={interpolate(copy.editMember, {
          name: editingMember ? memberName(editingMember, copy) : "",
        })}
      >
        <div className="team-form">
          <Field id="team-edit-role" label={copy.role}>
            <Select
              id="team-edit-role"
              onChange={(event) =>
                setEditRole(event.currentTarget.value as TeamRole)
              }
              options={roleOptions(copy)}
              value={editRole}
            />
          </Field>
          <PermissionConfigurationFields
            copy={copy}
            idPrefix="team-edit"
            mode={editMode}
            onModeChange={setEditMode}
            onPermissionsChange={setEditPermissions}
            permissions={editPermissions}
          />
          {updateMember.isError ? (
            <p className="form-error" role="alert">
              {copy.memberError}
            </p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        closeLabel={common.close}
        description={copy.revokeMemberDescription}
        footer={
          <>
            <Button onClick={() => setRevokingMember(null)} variant="secondary">
              {common.cancel}
            </Button>
            <Button
              loading={revokeMember.isPending}
              onClick={() => revokeMember.mutate()}
              variant="danger"
            >
              {copy.revokeMemberConfirm}
            </Button>
          </>
        }
        onClose={() => setRevokingMember(null)}
        open={Boolean(revokingMember)}
        title={interpolate(copy.revokeMemberTitle, {
          name: revokingMember ? memberName(revokingMember, copy) : "",
        })}
      >
        {revokeMember.isError ? (
          <p className="form-error" role="alert">
            {copy.memberError}
          </p>
        ) : null}
      </Dialog>

      {notice ? (
        <div className="app-toast-region">
          <Toast
            dismissLabel={common.close}
            onDismiss={() => setNotice("")}
            title={notice}
          />
        </div>
      ) : null}
    </div>
  );
}

function PermissionConfigurationFields({
  copy,
  idPrefix,
  mode,
  onModeChange,
  onPermissionsChange,
  permissions,
}: {
  copy: Dictionary["team"];
  idPrefix: string;
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
  onPermissionsChange: (permissions: Permission[]) => void;
  permissions: Permission[];
}) {
  return (
    <>
      <Field id={`${idPrefix}-permission-mode`} label={copy.permissionMode}>
        <Select
          id={`${idPrefix}-permission-mode`}
          onChange={(event) => {
            const nextMode = event.currentTarget.value as PermissionMode;
            onModeChange(nextMode);
            if (nextMode === "DEFAULT") onPermissionsChange([]);
          }}
          options={[
            { label: copy.defaultPermissions, value: "DEFAULT" },
            { label: copy.customPermissions, value: "CUSTOM" },
          ]}
          value={mode}
        />
      </Field>
      {mode === "CUSTOM" ? (
        <fieldset className="team-permissions">
          <legend>{copy.permissions}</legend>
          <div className="team-permissions__grid">
            {DELEGABLE_PERMISSIONS.map((permission) => (
              <Checkbox
                checked={permissions.includes(permission)}
                key={permission}
                label={permissionLabel(permission, copy)}
                onChange={(event) =>
                  onPermissionsChange(
                    event.currentTarget.checked
                      ? [...permissions, permission]
                      : permissions.filter((value) => value !== permission),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
      ) : null}
    </>
  );
}

function TeamLoading({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="feature-loading"
      role="status"
    >
      <span className="dawah-sr-only">{label}</span>
      <span className="skeleton" />
      <span className="skeleton" />
    </div>
  );
}

function memberName(member: TeamMember, copy: Dictionary["team"]): string {
  return member.displayName ?? member.email ?? roleLabel(member.role, copy);
}

function roleLabel(
  role: TeamMember["role"] | TeamInvitation["role"],
  copy: Dictionary["team"],
): string {
  if (role === "OWNER") return copy.owner;
  return role === "CO_HOST" ? copy.coHost : copy.checkInStaff;
}

function memberStatusLabel(
  status: TeamMember["status"],
  copy: Dictionary["team"],
): string {
  if (status === "ACTIVE") return copy.active;
  if (status === "PENDING") return copy.pending;
  return copy.revoked;
}

function roleOptions(copy: Dictionary["team"]) {
  return [
    { label: copy.coHost, value: "CO_HOST" },
    { label: copy.checkInStaff, value: "CHECK_IN_STAFF" },
  ];
}

function countryOptions(copy: Dictionary["team"]) {
  return [
    { label: copy.countrySaudi, value: "SA" },
    { label: copy.countryUae, value: "AE" },
    { label: copy.countryKuwait, value: "KW" },
    { label: copy.countryBahrain, value: "BH" },
    { label: copy.countryQatar, value: "QA" },
    { label: copy.countryOman, value: "OM" },
  ];
}

function dialCode(country: PhoneCountry): string {
  return {
    AE: "+971",
    BH: "+973",
    KW: "+965",
    OM: "+968",
    QA: "+974",
    SA: "+966",
  }[country];
}

function isDelegable(permission: Permission): boolean {
  return !NON_DELEGABLE_PERMISSIONS.has(permission);
}

function permissionLabel(
  permission: Permission,
  copy: Dictionary["team"],
): string {
  return {
    "billing.manage": copy.permissionBillingManage,
    "checkin.use": copy.permissionCheckinUse,
    "event.archive": copy.permissionEventArchive,
    "event.delete": copy.permissionEventDelete,
    "event.edit": copy.permissionEventEdit,
    "event.view": copy.permissionEventView,
    "guest.create": copy.permissionGuestCreate,
    "guest.delete": copy.permissionGuestDelete,
    "guest.edit": copy.permissionGuestEdit,
    "guest.export": copy.permissionGuestExport,
    "guest.import": copy.permissionGuestImport,
    "guest.phone.view": copy.permissionGuestPhoneView,
    "guest.view": copy.permissionGuestView,
    "invitation.resend": copy.permissionInvitationResend,
    "invitation.send": copy.permissionInvitationSend,
    "reminder.send": copy.permissionReminderSend,
    "reports.view": copy.permissionReportsView,
    "rsvp.edit": copy.permissionRsvpEdit,
    "team.manage": copy.permissionTeamManage,
  }[permission];
}

function formatDateTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(
    locale === "ar-SA" ? "ar-SA-u-nu-arab" : "en-US",
  ).format(value);
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}
