"use client";

import type {
  CreateInvitationInput,
  DuplicateInvitationConflictDetails,
  InvitationDetail,
  InvitationListItem,
  ListInvitationsQuery,
  UpdateInvitationInput,
} from "@dawah/api-contract";
import {
  Avatar,
  Banner,
  Button,
  Card,
  ChoiceCard,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  Num,
  Phone,
  PhoneInput,
  Select,
  StatCard,
  StatusPill,
  Stepper,
  Table,
  Tabs,
  Tag,
  Toast,
  type TableColumn,
} from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import React, { useEffect, useState, type FormEvent } from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import {
  ApiClientError,
  bulkCancelInvitations,
  cancelInvitation,
  createInvitation,
  getInvitation,
  listInvitations,
  updateInvitation,
} from "../lib/api";

type GuestCopy = Dictionary["guests"];
type InvitationType = InvitationListItem["invitationType"];
type RsvpStatus = InvitationListItem["rsvpStatus"];
type CancellationStatus = ListInvitationsQuery["cancellationStatus"];
type SortBy = ListInvitationsQuery["sortBy"];
type SortOrder = ListInvitationsQuery["sortOrder"];
type PhoneCountry = CreateInvitationInput["phoneCountry"];

interface GuestManagementProps {
  eventId: string;
  locale: AppLocale;
  copy: GuestCopy;
  common: Dictionary["common"];
  supabase: SupabaseClient | null;
}

interface SortChoice {
  sortBy: SortBy;
  sortOrder: SortOrder;
}

type ToastState = { kind: "success" | "error"; title: string } | null;
type CancelRequest =
  | { kind: "single"; invitationIds: [string] }
  | { kind: "bulk"; invitationIds: string[] };

const pageSize = 25;

const sortChoices = {
  NAME: { sortBy: "DISPLAY_NAME", sortOrder: "ASC" },
  NEWEST: { sortBy: "CREATED_AT", sortOrder: "DESC" },
  OLDEST: { sortBy: "CREATED_AT", sortOrder: "ASC" },
  UPDATED: { sortBy: "UPDATED_AT", sortOrder: "DESC" },
  EXPECTED: { sortBy: "EXPECTED_ATTENDEES", sortOrder: "DESC" },
} as const satisfies Record<string, SortChoice>;

export function GuestManagement({
  eventId,
  locale,
  copy,
  common,
  supabase,
}: GuestManagementProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [invitationType, setInvitationType] = useState<InvitationType>();
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>();
  const [cancellationStatus, setCancellationStatus] =
    useState<CancellationStatus>("ACTIVE");
  const [sortKey, setSortKey] = useState<keyof typeof sortChoices>("NEWEST");
  const [selected, setSelected] = useState<Array<string | number>>([]);
  const [detailId, setDetailId] = useState<string>();
  const [formState, setFormState] = useState<
    { mode: "create" } | { mode: "edit"; invitation: InvitationDetail }
  >();
  const [cancelRequest, setCancelRequest] = useState<CancelRequest>();
  const [toast, setToast] = useState<ToastState>(null);
  const sort = sortChoices[sortKey];
  const filters: ListInvitationsQuery = {
    page,
    pageSize,
    ...(search ? { search } : {}),
    ...(invitationType ? { invitationType } : {}),
    ...(rsvpStatus ? { rsvpStatus } : {}),
    cancellationStatus,
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
  };
  const invitations = useQuery({
    queryKey: ["events", eventId, "invitations", filters],
    queryFn: () => listInvitations(supabase, eventId, filters),
  });
  const detail = useQuery({
    queryKey: ["events", eventId, "invitations", detailId],
    queryFn: () => getInvitation(supabase, eventId, detailId!),
    enabled: Boolean(detailId),
  });

  const invalidateInvitations = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["events", eventId, "invitations"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["events", eventId, "dashboard"],
      }),
    ]);
  };
  const cancelMutation = useMutation({
    mutationFn: async (request: CancelRequest) => {
      if (request.kind === "single") {
        await cancelInvitation(supabase, eventId, request.invitationIds[0]);
        return { cancelledCount: 1 };
      }
      return bulkCancelInvitations(supabase, eventId, {
        invitationIds: request.invitationIds,
      });
    },
    onSuccess: async (result) => {
      setCancelRequest(undefined);
      setPage(1);
      setSelected([]);
      setDetailId(undefined);
      setToast({
        kind: "success",
        title: interpolate(copy.cancelSuccess, {
          count: formatNumber(result.cancelledCount, locale),
        }),
      });
      await invalidateInvitations();
    },
    onError: () => {
      setCancelRequest(undefined);
      setToast({ kind: "error", title: copy.cancelError });
    },
  });

  useEffect(() => {
    const totalPages = invitations.data?.pagination.totalPages;
    if (totalPages === undefined) return;
    const lastPage = Math.max(1, totalPages);
    if (page > lastPage) setPage(lastPage);
  }, [invitations.data?.pagination.totalPages, page]);

  const resetPageAndSelection = () => {
    setPage(1);
    setSelected([]);
  };
  const clearFilters = () => {
    setSearchDraft("");
    setSearch("");
    setInvitationType(undefined);
    setRsvpStatus(undefined);
    setCancellationStatus("ACTIVE");
    setSortKey("NEWEST");
    resetPageAndSelection();
  };
  const hasFilters =
    Boolean(search || invitationType || rsvpStatus) ||
    cancellationStatus !== "ACTIVE" ||
    sortKey !== "NEWEST";
  const rows = invitations.data?.items ?? [];
  const columns: readonly TableColumn<InvitationListItem>[] = [
    {
      key: "contact",
      header: copy.contactColumn,
      wrap: true,
      render: (invitation) => (
        <div className="guest-contact-cell">
          <Avatar name={invitation.displayName} size="sm" />
          <div>
            <div className="guest-contact-name">
              <strong>{invitation.displayName}</strong>
              {invitation.cancelledAt ? (
                <Tag size="sm" tone="neutral">
                  {copy.cancelled}
                </Tag>
              ) : null}
            </div>
            {invitation.contactName !== invitation.displayName ? (
              <span>{invitation.contactName}</span>
            ) : null}
            <PhoneValue copy={copy} invitation={invitation} />
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: copy.typeColumn,
      render: (invitation) => (
        <Tag size="sm" tone="outline">
          {invitationTypeLabel(invitation.invitationType, copy)}
        </Tag>
      ),
    },
    {
      key: "size",
      header: copy.sizeColumn,
      align: "end",
      render: (invitation) => (
        <Num locale={locale} value={invitation.maximumAttendees} />
      ),
    },
    {
      key: "expected",
      header: copy.expectedColumn,
      align: "end",
      render: (invitation) => (
        <strong className="num">
          {formatNumber(invitation.expectedAttendees, locale)}
        </strong>
      ),
    },
    {
      key: "rsvp",
      header: copy.rsvpColumn,
      render: (invitation) => (
        <StatusPill
          kind="rsvp"
          label={rsvpLabel(invitation.rsvpStatus, copy)}
          size="sm"
          status={rsvpKind(invitation.rsvpStatus)}
        />
      ),
    },
    {
      key: "updated",
      header: copy.updatedColumn,
      render: (invitation) => (
        <time dateTime={invitation.updatedAt}>
          {formatDate(invitation.updatedAt, locale)}
        </time>
      ),
    },
  ];

  return (
    <>
      <header className="workspace-page-header guest-page-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <Button icon="plus" onClick={() => setFormState({ mode: "create" })}>
          {copy.addInvitation}
        </Button>
      </header>

      {invitations.isPending ? (
        <div
          aria-label={copy.loadingTotals}
          className="workspace-stat-grid guest-stat-grid"
          role="status"
        >
          <span className="dawah-sr-only">{copy.loadingTotals}</span>
          <div className="skeleton workspace-stat-skeleton" />
          <div className="skeleton workspace-stat-skeleton" />
          <div className="skeleton workspace-stat-skeleton" />
        </div>
      ) : (
        <div className="workspace-stat-grid guest-stat-grid">
          <StatCard
            context={copy.groupsUnit}
            icon="mail"
            label={copy.invitationGroups}
            locale={locale}
            value={invitations.data?.totals.invitationGroups ?? 0}
          />
          <StatCard
            context={copy.peopleUnit}
            icon="users"
            label={copy.namedGuests}
            locale={locale}
            value={invitations.data?.totals.namedGuests ?? 0}
          />
          <StatCard
            context={copy.peopleUnit}
            label={copy.expectedAttendees}
            locale={locale}
            tone="accepted"
            value={invitations.data?.totals.expectedAttendees ?? 0}
          />
        </div>
      )}

      <Card className="guest-list-card">
        <Tabs
          ariaLabel={copy.tabsLabel}
          items={[
            { id: "ALL", label: copy.all },
            { id: "PENDING", label: copy.pending },
            { id: "ACCEPTED", label: copy.accepted },
            { id: "PARTIALLY_ACCEPTED", label: copy.partial },
            { id: "DECLINED", label: copy.declined },
          ]}
          onChange={(value) => {
            setRsvpStatus(value === "ALL" ? undefined : (value as RsvpStatus));
            resetPageAndSelection();
          }}
          value={rsvpStatus ?? "ALL"}
        />

        <div className="guest-list-toolbar">
          <form
            aria-label={copy.searchLabel}
            className="guest-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchDraft.trim());
              resetPageAndSelection();
            }}
          >
            <label className="dawah-sr-only" htmlFor="guest-search">
              {copy.searchLabel}
            </label>
            <Input
              id="guest-search"
              icon="search"
              onChange={(event) => setSearchDraft(event.currentTarget.value)}
              placeholder={copy.searchPlaceholder}
              size="sm"
              value={searchDraft}
            />
            <Button size="sm" type="submit" variant="secondary">
              {copy.searchAction}
            </Button>
          </form>
          <div
            aria-label={copy.filtersLabel}
            className="guest-filter-controls"
            role="group"
          >
            <Select
              aria-label={copy.filterType}
              onChange={(event) => {
                setInvitationType(
                  event.currentTarget.value
                    ? (event.currentTarget.value as InvitationType)
                    : undefined,
                );
                resetPageAndSelection();
              }}
              options={[
                { value: "", label: copy.allTypes },
                { value: "SINGLE", label: copy.single },
                { value: "NAMED_GROUP", label: copy.namedGroup },
                {
                  value: "PRIMARY_WITH_COMPANIONS",
                  label: copy.companions,
                },
              ]}
              size="sm"
              value={invitationType ?? ""}
            />
            <Select
              aria-label={copy.filterCancelled}
              onChange={(event) => {
                setCancellationStatus(
                  event.currentTarget.value as CancellationStatus,
                );
                resetPageAndSelection();
              }}
              options={[
                { value: "ACTIVE", label: copy.activeOnly },
                { value: "ALL", label: copy.allRecords },
                { value: "CANCELLED", label: copy.cancelledOnly },
              ]}
              size="sm"
              value={cancellationStatus}
            />
            <Select
              aria-label={copy.sortLabel}
              onChange={(event) => {
                setSortKey(
                  event.currentTarget.value as keyof typeof sortChoices,
                );
                resetPageAndSelection();
              }}
              options={[
                { value: "NAME", label: copy.sortName },
                { value: "NEWEST", label: copy.sortNewest },
                { value: "OLDEST", label: copy.sortOldest },
                { value: "UPDATED", label: copy.sortUpdated },
                { value: "EXPECTED", label: copy.sortExpected },
              ]}
              size="sm"
              value={sortKey}
            />
          </div>
        </div>

        {selected.length ? (
          <div className="guest-bulk-bar">
            <strong>
              {interpolate(copy.selected, {
                count: formatNumber(selected.length, locale),
              })}
            </strong>
            <Button
              icon="ban"
              onClick={() =>
                setCancelRequest({
                  kind: "bulk",
                  invitationIds: selected.map(String),
                })
              }
              size="sm"
              variant="danger-soft"
            >
              {copy.cancelSelected}
            </Button>
          </div>
        ) : null}

        {invitations.isPending ? (
          <GuestListLoading label={copy.loading} />
        ) : invitations.isError ? (
          <EmptyState
            action={
              <Button onClick={() => invitations.refetch()} variant="secondary">
                {copy.retry}
              </Button>
            }
            description={copy.loadErrorDescription}
            icon="circle-alert"
            title={copy.loadErrorTitle}
          />
        ) : (
          <>
            <Table
              columns={columns}
              emptyState={
                <EmptyState
                  action={
                    hasFilters ? (
                      <Button onClick={clearFilters} variant="secondary">
                        {copy.clearFilters}
                      </Button>
                    ) : (
                      <Button
                        icon="plus"
                        onClick={() => setFormState({ mode: "create" })}
                      >
                        {copy.addInvitation}
                      </Button>
                    )
                  }
                  description={
                    hasFilters
                      ? copy.noResultsDescription
                      : copy.emptyDescription
                  }
                  icon={hasFilters ? "search" : "users"}
                  title={hasFilters ? copy.noResultsTitle : copy.emptyTitle}
                />
              }
              getRowKey={(invitation) => invitation.id}
              onRowClick={(invitation) => setDetailId(invitation.id)}
              onSelect={setSelected}
              renderMobile={(invitation) => (
                <MobileInvitationCard
                  copy={copy}
                  invitation={invitation}
                  locale={locale}
                />
              )}
              rowActionHeaderLabel={copy.actionsColumn}
              rowLabel={(invitation) =>
                interpolate(copy.openDetails, {
                  name: invitation.displayName,
                })
              }
              rows={rows}
              selectAllLabel={copy.selectAll}
              selectable
              selected={selected}
              selectRowLabel={(invitation) =>
                interpolate(copy.selectRow, {
                  name: invitation.displayName,
                })
              }
            />
            {invitations.data ? (
              <div className="guest-pagination">
                <span>
                  {interpolate(copy.resultSummary, {
                    count: formatNumber(
                      invitations.data.pagination.totalItems,
                      locale,
                    ),
                  })}
                </span>
                {invitations.data.pagination.totalPages > 0 ? (
                  <div>
                    <Button
                      disabled={invitations.data.pagination.page <= 1}
                      onClick={() => {
                        setPage(
                          Math.max(1, invitations.data.pagination.page - 1),
                        );
                        setSelected([]);
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      {copy.previousPage}
                    </Button>
                    <span className="num">
                      {interpolate(copy.pageSummary, {
                        page: formatNumber(
                          invitations.data.pagination.page,
                          locale,
                        ),
                        total: formatNumber(
                          invitations.data.pagination.totalPages,
                          locale,
                        ),
                      })}
                    </span>
                    <Button
                      disabled={
                        invitations.data.pagination.page >=
                        invitations.data.pagination.totalPages
                      }
                      onClick={() => {
                        setPage(invitations.data.pagination.page + 1);
                        setSelected([]);
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      {copy.nextPage}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </Card>

      <InvitationDetailDrawer
        common={common}
        copy={copy}
        invitation={detail.data}
        isError={detail.isError}
        isLoading={detail.isPending && Boolean(detailId)}
        locale={locale}
        onCancel={(invitation) =>
          setCancelRequest({
            kind: "single",
            invitationIds: [invitation.id],
          })
        }
        onClose={() => setDetailId(undefined)}
        onEdit={(invitation) => {
          setDetailId(undefined);
          setFormState({ mode: "edit", invitation });
        }}
        onRetry={() => detail.refetch()}
        open={Boolean(detailId)}
      />

      {formState ? (
        <InvitationFormDrawer
          common={common}
          copy={copy}
          eventId={eventId}
          initial={formState.mode === "edit" ? formState.invitation : undefined}
          locale={locale}
          mode={formState.mode}
          onClose={() => setFormState(undefined)}
          onSaved={async (mode) => {
            setFormState(undefined);
            setToast({
              kind: "success",
              title:
                mode === "create" ? copy.createSuccess : copy.updateSuccess,
            });
            await invalidateInvitations();
          }}
          supabase={supabase}
        />
      ) : null}

      <Dialog
        closeLabel={common.close}
        description={interpolate(copy.cancelDialogDescription, {
          count: formatNumber(cancelRequest?.invitationIds.length ?? 0, locale),
        })}
        footer={
          <>
            <Button
              onClick={() => setCancelRequest(undefined)}
              variant="secondary"
            >
              {common.cancel}
            </Button>
            <Button
              loading={cancelMutation.isPending}
              onClick={() => {
                if (cancelRequest) cancelMutation.mutate(cancelRequest);
              }}
              variant="danger"
            >
              {copy.confirmCancel}
            </Button>
          </>
        }
        onClose={() => setCancelRequest(undefined)}
        open={Boolean(cancelRequest?.invitationIds.length)}
        title={copy.cancelDialogTitle}
      >
        <p>
          {interpolate(copy.cancelDialogDescription, {
            count: formatNumber(
              cancelRequest?.invitationIds.length ?? 0,
              locale,
            ),
          })}
        </p>
      </Dialog>

      {toast ? (
        <div className="guest-toast">
          <Toast
            dismissLabel={copy.dismiss}
            kind={toast.kind}
            onDismiss={() => setToast(null)}
            title={toast.title}
          />
        </div>
      ) : null}
    </>
  );
}

function PhoneValue({
  invitation,
  copy,
}: {
  invitation: InvitationListItem;
  copy: GuestCopy;
}) {
  return (
    <Phone
      aria-label={invitation.phoneIsMasked ? copy.maskedPhone : copy.phone}
      title={invitation.phoneIsMasked ? copy.maskedPhone : undefined}
      value={invitation.phoneE164 ?? invitation.phoneMasked}
    />
  );
}

function MobileInvitationCard({
  invitation,
  copy,
  locale,
}: {
  invitation: InvitationListItem;
  copy: GuestCopy;
  locale: AppLocale;
}) {
  return (
    <div className="guest-mobile-card">
      <div>
        <strong>{invitation.displayName}</strong>
        <PhoneValue copy={copy} invitation={invitation} />
      </div>
      <div>
        <Tag size="sm" tone="outline">
          {invitationTypeLabel(invitation.invitationType, copy)}
        </Tag>
        {invitation.cancelledAt ? (
          <Tag size="sm" tone="neutral">
            {copy.cancelled}
          </Tag>
        ) : null}
        <StatusPill
          kind="rsvp"
          label={rsvpLabel(invitation.rsvpStatus, copy)}
          size="sm"
          status={rsvpKind(invitation.rsvpStatus)}
        />
      </div>
      <dl>
        <div>
          <dt>{copy.sizeColumn}</dt>
          <dd>
            <Num locale={locale} value={invitation.maximumAttendees} />
          </dd>
        </div>
        <div>
          <dt>{copy.expectedColumn}</dt>
          <dd>
            <Num locale={locale} value={invitation.expectedAttendees} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

function InvitationDetailDrawer({
  open,
  invitation,
  isLoading,
  isError,
  locale,
  copy,
  common,
  onClose,
  onRetry,
  onEdit,
  onCancel,
}: {
  open: boolean;
  invitation?: InvitationDetail;
  isLoading: boolean;
  isError: boolean;
  locale: AppLocale;
  copy: GuestCopy;
  common: Dictionary["common"];
  onClose: () => void;
  onRetry: () => void;
  onEdit: (invitation: InvitationDetail) => void;
  onCancel: (invitation: InvitationDetail) => void;
}) {
  return (
    <Drawer
      className="guest-detail-drawer"
      closeLabel={common.close}
      description={copy.detailDescription}
      footer={
        invitation && !invitation.cancelledAt ? (
          <>
            <Button
              icon="ban"
              onClick={() => onCancel(invitation)}
              variant="danger-soft"
            >
              {copy.cancelInvitation}
            </Button>
            <Button onClick={() => onEdit(invitation)} variant="secondary">
              {copy.edit}
            </Button>
          </>
        ) : undefined
      }
      onClose={onClose}
      open={open}
      title={invitation?.displayName ?? copy.title}
    >
      {isLoading ? (
        <GuestListLoading label={copy.loading} />
      ) : isError || !invitation ? (
        <Banner
          actionLabel={copy.retry}
          kind="danger"
          onAction={onRetry}
          title={copy.loadErrorTitle}
        />
      ) : (
        <div className="guest-detail">
          <div className="guest-detail__identity">
            <Avatar name={invitation.displayName} size="lg" />
            <div>
              <strong>{invitation.displayName}</strong>
              <span>{invitation.contactName}</span>
              <PhoneValue copy={copy} invitation={invitation} />
            </div>
          </div>
          <div className="guest-detail__pills">
            <Tag tone={invitation.cancelledAt ? "neutral" : "accent"}>
              {invitation.cancelledAt ? copy.cancelled : copy.active}
            </Tag>
            <StatusPill
              kind="rsvp"
              label={rsvpLabel(invitation.rsvpStatus, copy)}
              status={rsvpKind(invitation.rsvpStatus)}
            />
          </div>
          <div className="guest-detail__metrics">
            <Card tone="sunken">
              <span>{copy.invitationType}</span>
              <strong>
                {invitationTypeLabel(invitation.invitationType, copy)}
              </strong>
              <small>
                {copy.sizeColumn}:{" "}
                {formatNumber(invitation.maximumAttendees, locale)}
              </small>
            </Card>
            <Card tone="sunken">
              <span>{copy.expectedAttendees}</span>
              <strong className="num">
                {formatNumber(invitation.expectedAttendees, locale)}{" "}
                <small>{copy.peopleUnit}</small>
              </strong>
            </Card>
          </div>
          <section className="guest-detail__section">
            <h3>{copy.namedMembers}</h3>
            <ol>
              {invitation.members.map((member) => (
                <li key={member.id}>
                  <Icon name={member.isPrimary ? "user-plus" : "users"} />
                  <span>{member.name}</span>
                </li>
              ))}
            </ol>
          </section>
          {invitation.invitationType === "PRIMARY_WITH_COMPANIONS" ? (
            <div className="guest-detail__row">
              <span>{copy.maxCompanions}</span>
              <strong>
                <Num locale={locale} value={invitation.maxCompanions} />
              </strong>
            </div>
          ) : null}
          <div className="guest-detail__row">
            <span>{copy.internalNote}</span>
            <strong>{invitation.internalNote || copy.noNote}</strong>
          </div>
          <div className="guest-detail__dates">
            <span>
              {copy.createdAt}: {formatDate(invitation.createdAt, locale)}
            </span>
            <span>
              {copy.updatedAt}: {formatDate(invitation.updatedAt, locale)}
            </span>
          </div>
        </div>
      )}
    </Drawer>
  );
}

interface EditableMember {
  key: string;
  name: string;
  isPrimary: boolean;
}

interface FormErrors {
  displayName?: string;
  contactName?: string;
  phoneNumber?: string;
  members?: string;
}

function InvitationFormDrawer({
  mode,
  eventId,
  locale,
  copy,
  common,
  supabase,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  eventId: string;
  locale: AppLocale;
  copy: GuestCopy;
  common: Dictionary["common"];
  supabase: SupabaseClient | null;
  initial?: InvitationDetail;
  onClose: () => void;
  onSaved: (mode: "create" | "edit") => Promise<void>;
}) {
  const [invitationType, setInvitationType] = useState<InvitationType>(
    initial?.invitationType ?? "SINGLE",
  );
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [contactName, setContactName] = useState(initial?.contactName ?? "");
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(
    isPhoneCountry(initial?.phoneCountry) ? initial.phoneCountry : "SA",
  );
  const [phoneNumber, setPhoneNumber] = useState(() =>
    initial?.phoneE164
      ? isPhoneCountry(initial.phoneCountry)
        ? nationalPhone(initial.phoneE164, initial.phoneCountry)
        : initial.phoneE164
      : "",
  );
  const [internalNote, setInternalNote] = useState(initial?.internalNote ?? "");
  const [maxCompanions, setMaxCompanions] = useState(
    initial?.maxCompanions ?? 0,
  );
  const [members, setMembers] = useState<EditableMember[]>(() =>
    initial?.invitationType === "NAMED_GROUP"
      ? initial.members.map((member) => ({
          key: member.id,
          name: member.name,
          isPrimary: member.isPrimary,
        }))
      : [{ key: "member-1", name: "", isPrimary: false }],
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [duplicate, setDuplicate] =
    useState<DuplicateInvitationConflictDetails>();
  const [saveFailure, setSaveFailure] = useState<string>();
  const phoneLocked = Boolean(initial?.phoneIsMasked);
  const structureLocked = Boolean(initial && initial.rsvpStatus !== "PENDING");
  const currentInput = buildInvitationInput({
    displayName,
    contactName,
    phoneNumber,
    phoneCountry,
    phoneLocked,
    invitationType,
    maxCompanions,
    internalNote,
    members,
    duplicateOverride: false,
    mode,
    initial,
  });
  const hasChanges =
    mode === "create" ||
    Object.keys(currentInput).some((key) => key !== "duplicateOverride");
  const mutation = useMutation({
    mutationFn: async (duplicateOverride: boolean) => {
      const input = buildInvitationInput({
        displayName,
        contactName,
        phoneNumber,
        phoneCountry,
        phoneLocked,
        invitationType,
        maxCompanions,
        internalNote,
        members,
        duplicateOverride,
        mode,
        initial,
      });
      if (mode === "edit" && initial) {
        return updateInvitation(
          supabase,
          eventId,
          initial.id,
          input as UpdateInvitationInput,
        );
      }
      return createInvitation(
        supabase,
        eventId,
        input as CreateInvitationInput,
      );
    },
  });

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!displayName.trim()) next.displayName = copy.requiredError;
    if (invitationType === "NAMED_GROUP" && !contactName.trim()) {
      next.contactName = copy.requiredError;
    }
    if (!phoneLocked && !phoneNumber.trim()) {
      next.phoneNumber = copy.requiredError;
    }
    if (
      invitationType === "NAMED_GROUP" &&
      members.some((member) => !member.name.trim())
    ) {
      next.members = copy.memberRequiredError;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const persist = async (duplicateOverride: boolean) => {
    if (!validate()) return;
    setSaveFailure(undefined);
    try {
      await mutation.mutateAsync(duplicateOverride);
      await onSaved(mode);
    } catch (error) {
      const code = errorCode(error);
      if (code === "DUPLICATE_PHONE_REQUIRES_OVERRIDE") {
        setDuplicate(duplicateConflictDetails(error));
      } else if (code === "PHONE_INVALID" || code === "PHONE_REQUIRED") {
        setErrors((current) => ({
          ...current,
          phoneNumber: copy.phoneInvalidError,
        }));
      } else if (code === "INVITATION_RSVP_LOCKED") {
        setSaveFailure(copy.rsvpLockedSaveError);
      } else if (
        code?.includes("STRUCTURE") ||
        code?.includes("MEMBER_COUNT")
      ) {
        setSaveFailure(copy.structureError);
      } else {
        setSaveFailure(copy.saveError);
      }
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void persist(false);
  };

  return (
    <Drawer
      className="guest-form-drawer"
      closeLabel={common.close}
      description={copy.formDescription}
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            {common.cancel}
          </Button>
          <Button
            disabled={!hasChanges}
            form="invitation-form"
            loading={mutation.isPending}
            type="submit"
          >
            {mode === "create" ? copy.create : copy.update}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={mode === "create" ? copy.addTitle : copy.editTitle}
    >
      <form
        className="guest-form"
        id="invitation-form"
        noValidate
        onSubmit={submit}
      >
        {duplicate ? (
          <Banner
            actionLabel={
              mode === "create"
                ? copy.duplicateOverride
                : copy.duplicateOverrideUpdate
            }
            description={duplicateDescription(duplicate, copy, locale)}
            kind="warning"
            onAction={() => void persist(true)}
            title={copy.duplicateTitle}
          />
        ) : null}
        {saveFailure ? <Banner kind="danger" title={saveFailure} /> : null}
        {structureLocked ? (
          <Banner
            description={copy.rsvpLockedDescription}
            icon="lock"
            kind="neutral"
            title={copy.rsvpLockedTitle}
          />
        ) : null}
        <fieldset className="guest-type-choices" disabled={structureLocked}>
          <legend>{copy.typeLegend}</legend>
          <div role="radiogroup">
            <ChoiceCard
              description={copy.singleDescription}
              icon="user-plus"
              onClick={() => setInvitationType("SINGLE")}
              selected={invitationType === "SINGLE"}
              title={copy.single}
            />
            <ChoiceCard
              description={copy.namedGroupDescription}
              icon="users"
              onClick={() => setInvitationType("NAMED_GROUP")}
              selected={invitationType === "NAMED_GROUP"}
              title={copy.namedGroup}
            />
            <ChoiceCard
              description={copy.companionsDescription}
              icon="user-plus"
              onClick={() => setInvitationType("PRIMARY_WITH_COMPANIONS")}
              selected={invitationType === "PRIMARY_WITH_COMPANIONS"}
              title={copy.companions}
            />
          </div>
        </fieldset>
        <Field
          error={errors.displayName}
          id="invitation-display-name"
          label={copy.displayName}
          required
        >
          <Input
            maxLength={160}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            placeholder={copy.displayNamePlaceholder}
            value={displayName}
          />
        </Field>
        {invitationType === "NAMED_GROUP" ? (
          <Field
            error={errors.contactName}
            id="invitation-contact-name"
            label={copy.contactName}
            required
          >
            <Input
              maxLength={120}
              onChange={(event) => setContactName(event.currentTarget.value)}
              placeholder={copy.contactNamePlaceholder}
              value={contactName}
            />
          </Field>
        ) : null}
        <div className="guest-phone-fields">
          <Field id="invitation-phone-country" label={copy.phoneCountry}>
            <Select
              disabled={phoneLocked}
              onChange={(event) => {
                setPhoneCountry(event.currentTarget.value as PhoneCountry);
                setDuplicate(undefined);
              }}
              options={countryOptions(copy)}
              value={phoneCountry}
            />
          </Field>
          <Field
            error={errors.phoneNumber}
            hint={phoneLocked ? copy.maskedPhone : undefined}
            id="invitation-phone"
            label={copy.phone}
            required={!phoneLocked}
          >
            {phoneLocked ? (
              <Input disabled mono value={initial?.phoneMasked ?? ""} />
            ) : (
              <PhoneInput
                countryCode={dialCode(phoneCountry)}
                maxLength={40}
                onChange={(event) => {
                  setPhoneNumber(event.currentTarget.value);
                  setDuplicate(undefined);
                }}
                placeholder={copy.phonePlaceholder}
                value={phoneNumber}
              />
            )}
          </Field>
        </div>
        {invitationType === "NAMED_GROUP" ? (
          <fieldset className="guest-member-editor" disabled={structureLocked}>
            <legend>{copy.membersTitle}</legend>
            {members.map((member, index) => (
              <div className="guest-member-row" key={member.key}>
                <Field
                  error={
                    errors.members && !member.name.trim()
                      ? errors.members
                      : undefined
                  }
                  id={`invitation-member-${member.key}`}
                  label={interpolate(copy.memberName, {
                    number: formatNumber(index + 1, locale),
                  })}
                >
                  <Input
                    maxLength={120}
                    onChange={(event) => {
                      const name = event.currentTarget.value;
                      setMembers((current) =>
                        current.map((candidate) =>
                          candidate.key === member.key
                            ? { ...candidate, name }
                            : candidate,
                        ),
                      );
                    }}
                    value={member.name}
                  />
                </Field>
                <IconButton
                  disabled={structureLocked || members.length === 1}
                  label={interpolate(copy.removeMember, {
                    number: formatNumber(index + 1, locale),
                  })}
                  name="x"
                  onClick={() =>
                    setMembers((current) =>
                      current.filter(
                        (candidate) => candidate.key !== member.key,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <Button
              disabled={structureLocked || members.length >= 100}
              icon="plus"
              onClick={() =>
                setMembers((current) => [
                  ...current,
                  {
                    key: `member-${Date.now()}-${current.length}`,
                    name: "",
                    isPrimary: false,
                  },
                ])
              }
              size="sm"
              variant="secondary"
            >
              {copy.addMember}
            </Button>
          </fieldset>
        ) : null}
        {invitationType === "PRIMARY_WITH_COMPANIONS" ? (
          <Field id="invitation-companions" label={copy.companionsAllowed}>
            <Stepper
              decrementLabel={copy.stepperDecrease}
              disabled={structureLocked}
              format={(value) => formatNumber(value, locale)}
              groupLabel={copy.companionsAllowed}
              incrementLabel={copy.stepperIncrease}
              max={100}
              onChange={setMaxCompanions}
              value={maxCompanions}
            />
          </Field>
        ) : null}
        <Field
          hint={copy.optional}
          id="invitation-note"
          label={copy.internalNote}
        >
          <Input
            maxLength={1_000}
            onChange={(event) => setInternalNote(event.currentTarget.value)}
            placeholder={copy.notePlaceholder}
            value={internalNote}
          />
        </Field>
      </form>
    </Drawer>
  );
}

function buildInvitationInput({
  displayName,
  contactName,
  phoneNumber,
  phoneCountry,
  phoneLocked,
  invitationType,
  maxCompanions,
  internalNote,
  members,
  duplicateOverride,
  mode,
  initial,
}: {
  displayName: string;
  contactName: string;
  phoneNumber: string;
  phoneCountry: PhoneCountry;
  phoneLocked: boolean;
  invitationType: InvitationType;
  maxCompanions: number;
  internalNote: string;
  members: EditableMember[];
  duplicateOverride: boolean;
  mode: "create" | "edit";
  initial?: InvitationDetail;
}): CreateInvitationInput | UpdateInvitationInput {
  const normalizedName = displayName.trim();
  const normalizedContactName =
    invitationType === "NAMED_GROUP"
      ? contactName.trim()
      : (initial?.contactName ?? normalizedName);
  const normalizedMaxCompanions =
    invitationType === "PRIMARY_WITH_COMPANIONS" ? maxCompanions : 0;
  const normalizedMembers =
    invitationType === "NAMED_GROUP"
      ? members
          .filter((member) => member.name.trim())
          .map((member) => ({
            name: member.name.trim(),
            isPrimary: member.isPrimary,
          }))
      : initial && initial.invitationType !== "NAMED_GROUP"
        ? initial.members.map((member) => ({
            name: member.name,
            isPrimary: member.isPrimary,
          }))
        : [{ name: normalizedName, isPrimary: true }];
  const shared = {
    displayName: normalizedName,
    contactName: normalizedContactName,
    invitationType,
    maxCompanions: normalizedMaxCompanions,
    members: normalizedMembers,
    duplicateOverride,
  };
  if (mode === "create") {
    return {
      ...shared,
      phoneNumber: phoneNumber.trim(),
      phoneCountry,
      ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
    };
  }

  const update: UpdateInvitationInput = { duplicateOverride };
  if (!initial) return update;
  if (normalizedName !== initial.displayName) {
    update.displayName = normalizedName;
  }
  if (normalizedContactName !== initial.contactName) {
    update.contactName = normalizedContactName;
  }
  if (
    !phoneLocked &&
    !phoneInputMatchesInitial(phoneNumber, phoneCountry, initial)
  ) {
    update.phoneNumber = phoneNumber.trim();
    update.phoneCountry = phoneCountry;
  }

  const structureLocked = initial.rsvpStatus !== "PENDING";
  if (!structureLocked) {
    if (invitationType !== initial.invitationType) {
      update.invitationType = invitationType;
    }
    if (normalizedMaxCompanions !== initial.maxCompanions) {
      update.maxCompanions = normalizedMaxCompanions;
    }
    if (!membersMatchInitial(normalizedMembers, initial.members)) {
      update.members = normalizedMembers;
    }
  }

  const normalizedNote = internalNote.trim() || null;
  if (normalizedNote !== initial.internalNote) {
    update.internalNote = normalizedNote;
  }
  return update;
}

function membersMatchInitial(
  members: ReadonlyArray<{ name: string; isPrimary: boolean }>,
  initial: InvitationDetail["members"],
): boolean {
  return (
    members.length === initial.length &&
    members.every(
      (member, index) =>
        member.name === initial[index]?.name &&
        member.isPrimary === initial[index]?.isPrimary,
    )
  );
}

function phoneInputMatchesInitial(
  phoneNumber: string,
  phoneCountry: PhoneCountry,
  initial: InvitationDetail,
): boolean {
  if (!initial.phoneE164) return false;
  if (comparablePhone(phoneNumber) === comparablePhone(initial.phoneE164)) {
    return true;
  }
  if (phoneCountry !== initial.phoneCountry) return false;
  const initialNational = nationalPhone(initial.phoneE164, phoneCountry);
  return comparablePhone(phoneNumber) === comparablePhone(initialNational);
}

function comparablePhone(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function GuestListLoading({ label }: { label: string }) {
  return (
    <div aria-label={label} className="guest-list-loading" role="status">
      <span className="dawah-sr-only">{label}</span>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

function invitationTypeLabel(type: InvitationType, copy: GuestCopy): string {
  if (type === "NAMED_GROUP") return copy.namedGroup;
  if (type === "PRIMARY_WITH_COMPANIONS") return copy.companions;
  return copy.single;
}

function rsvpKind(status: RsvpStatus): string {
  if (status === "PARTIALLY_ACCEPTED") return "partial";
  return status.toLowerCase();
}

function rsvpLabel(status: RsvpStatus, copy: GuestCopy): string {
  if (status === "ACCEPTED") return copy.accepted;
  if (status === "PARTIALLY_ACCEPTED") return copy.partial;
  if (status === "DECLINED") return copy.declined;
  return copy.pending;
}

function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(
    locale === "ar-SA" ? "ar-SA-u-nu-arab" : "en",
  ).format(value);
}

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function interpolate(
  template: string,
  replacements: Record<string, string>,
): string {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template,
  );
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof ApiClientError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function duplicateConflictDetails(
  error: unknown,
): DuplicateInvitationConflictDetails {
  const details =
    error instanceof ApiClientError
      ? error.details
      : error && typeof error === "object" && "details" in error
        ? error.details
        : undefined;
  if (
    details &&
    typeof details === "object" &&
    "duplicateCount" in details &&
    typeof details.duplicateCount === "number" &&
    "duplicates" in details &&
    Array.isArray(details.duplicates) &&
    details.duplicates.every(
      (duplicate) =>
        duplicate &&
        typeof duplicate === "object" &&
        "id" in duplicate &&
        typeof duplicate.id === "string" &&
        "displayName" in duplicate &&
        typeof duplicate.displayName === "string" &&
        "phoneMasked" in duplicate &&
        typeof duplicate.phoneMasked === "string",
    )
  ) {
    return {
      duplicateCount: details.duplicateCount,
      duplicates: details.duplicates,
      overrideRequired: true,
    };
  }
  return { duplicateCount: 0, duplicates: [], overrideRequired: true };
}

function duplicateDescription(
  details: DuplicateInvitationConflictDetails,
  copy: GuestCopy,
  locale: AppLocale,
): string {
  if (!details.duplicates.length) return copy.duplicateDescription;
  const matches = details.duplicates
    .map((duplicate) => `${duplicate.displayName} (${duplicate.phoneMasked})`)
    .join(locale === "ar-SA" ? "، " : ", ");
  return `${copy.duplicateDescription} ${interpolate(copy.duplicateMatches, {
    matches,
  })}`;
}

function countryOptions(copy: GuestCopy) {
  return [
    { value: "SA", label: copy.countrySaudi },
    { value: "AE", label: copy.countryUae },
    { value: "KW", label: copy.countryKuwait },
    { value: "BH", label: copy.countryBahrain },
    { value: "QA", label: copy.countryQatar },
    { value: "OM", label: copy.countryOman },
  ];
}

function dialCode(country: PhoneCountry): string {
  return {
    SA: "+966",
    AE: "+971",
    KW: "+965",
    BH: "+973",
    QA: "+974",
    OM: "+968",
  }[country];
}

function isPhoneCountry(country: string | undefined): country is PhoneCountry {
  return (
    country === "SA" ||
    country === "AE" ||
    country === "KW" ||
    country === "BH" ||
    country === "QA" ||
    country === "OM"
  );
}

function nationalPhone(value: string, country: PhoneCountry): string {
  const dial = dialCode(country);
  return value.startsWith(dial) ? value.slice(dial.length) : value;
}
