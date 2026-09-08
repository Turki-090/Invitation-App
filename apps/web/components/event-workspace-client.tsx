"use client";

import {
  createEventSchema,
  isSafeMapUrl,
  type EventDashboardSummary,
  type EventDetail,
  type EventSummary,
  type UpdateEventInput,
} from "@dawah/api-contract";
import {
  Banner,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  HostShell,
  Icon,
  IconButton,
  Input,
  ProgressBar,
  Select,
  StatCard,
  StatusPill,
  Switch,
  Toast,
} from "@dawah/ui";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { LocaleSwitcher } from "./locale-switcher";
import { GuestManagement } from "./guest-management";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import {
  archiveEvent,
  developmentAuthBypassEnabled,
  getEvent,
  getEventDashboard,
  listEvents,
  transitionEventStatus,
  updateEvent,
} from "../lib/api";
import { getSupabaseClient } from "../lib/supabase";

type WorkspaceSection = "overview" | "guests" | "settings";
type EditableEventStatus = Exclude<EventDetail["status"], "ARCHIVED">;

interface EventWorkspaceClientProps {
  eventId: string;
  locale: AppLocale;
  section: WorkspaceSection;
  copy: Dictionary["workspace"];
  guestsCopy: Dictionary["guests"];
  eventsCopy: Dictionary["events"];
  common: Dictionary["common"];
  shellCopy: Dictionary["shell"];
}

interface SettingsForm {
  nameAr: string;
  nameEn: string;
  eventType: EventDetail["eventType"];
  eventDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  venueNameAr: string;
  venueNameEn: string;
  city: string;
  mapUrl: string;
  rsvpDeadline: string;
  allowRsvpEdits: boolean;
  qrEnabled: boolean;
}

export function EventWorkspaceClient({
  eventId,
  locale,
  section,
  copy,
  guestsCopy,
  eventsCopy,
  common,
  shellCopy,
}: EventWorkspaceClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = getSupabaseClient();
  const apiAvailable = Boolean(supabase) || developmentAuthBypassEnabled;
  const event = useQuery({
    queryKey: ["events", eventId],
    enabled: apiAvailable,
    queryFn: () => getEvent(supabase, eventId),
  });
  const dashboard = useQuery({
    queryKey: ["events", eventId, "dashboard"],
    enabled: apiAvailable && section === "overview",
    queryFn: () => getEventDashboard(supabase, eventId),
  });
  const availableEvents = useQuery({
    queryKey: ["events"],
    enabled: apiAvailable,
    queryFn: () => listEvents(supabase),
  });

  const signOut = async () => {
    await supabase?.auth.signOut();
    router.push(`/${locale}`);
  };
  const setEventData = (updated: EventDetail) => {
    queryClient.setQueryData(["events", eventId], updated);
    void queryClient.invalidateQueries({ queryKey: ["events"] });
  };
  const transition = useMutation({
    mutationFn: (status: EditableEventStatus) =>
      transitionEventStatus(supabase, eventId, status),
    onSuccess: setEventData,
  });

  const name = event.data ? localizedName(event.data, locale) : common.wordmark;
  const navItems = [
    {
      id: "overview",
      label: copy.overview,
      href: `/${locale}/events/${eventId}`,
      icon: "layout-dashboard" as const,
      active: section === "overview",
    },
    {
      id: "guests",
      label: guestsCopy.navigation,
      href: `/${locale}/events/${eventId}/guests`,
      icon: "users" as const,
      active: section === "guests",
    },
    {
      id: "settings",
      label: copy.settings,
      href: `/${locale}/events/${eventId}/settings`,
      icon: "settings" as const,
      active: section === "settings",
    },
  ];

  return (
    <HostShell
      brand={
        <div className="workspace-brand">
          <Link
            aria-label={common.homeLabel}
            className="wordmark"
            href={`/${locale}/events`}
          >
            <span>{common.wordmark}</span>
            <small>{common.wordmarkLatin}</small>
          </Link>
          <span className="workspace-brand__event" title={name}>
            {name}
          </span>
        </div>
      }
      collapseLabel={shellCopy.collapse}
      compactUtility={
        <IconButton label={copy.signOut} name="log-out" onClick={signOut} />
      }
      expandLabel={shellCopy.expand}
      items={navItems}
      navigationLabel={copy.navigationLabel}
      topbar={
        <div className="workspace-topbar">
          <Link
            aria-label={copy.allEvents}
            className="workspace-all-events"
            href={`/${locale}/events`}
          >
            <Icon flipRtl name="arrow-left" size={16} />
            <span>{copy.allEvents}</span>
          </Link>
          {availableEvents.data?.length ? (
            <Select
              aria-label={copy.switchEvent}
              onChange={(change) =>
                router.push(`/${locale}/events/${change.currentTarget.value}`)
              }
              options={availableEvents.data.map((available) => ({
                value: available.id,
                label: localizedName(available, locale),
              }))}
              size="sm"
              value={eventId}
            />
          ) : null}
          <LocaleSwitcher
            arabicLabel={common.arabic}
            englishLabel={common.english}
            label={common.language}
            locale={locale}
          />
        </div>
      }
      utility={
        <Button fullWidth icon="log-out" onClick={signOut} variant="ghost">
          {copy.signOut}
        </Button>
      }
    >
      <section className="workspace-content">
        {!apiAvailable ? (
          <EmptyState
            description={eventsCopy.setupMissing}
            icon="lock"
            title={copy.loadErrorTitle}
          />
        ) : event.isLoading ? (
          <WorkspaceLoading label={copy.loading} />
        ) : event.isError || !event.data ? (
          <EmptyState
            action={
              <div className="empty-actions">
                <Button onClick={() => event.refetch()} variant="secondary">
                  {common.retry}
                </Button>
                <Link
                  className="dawah-button dawah-button--ghost dawah-button--md"
                  href={`/${locale}/events`}
                >
                  <span>{copy.backToEvents}</span>
                </Link>
              </div>
            }
            description={copy.loadErrorDescription}
            icon="circle-alert"
            title={copy.loadErrorTitle}
          />
        ) : section === "guests" ? (
          <GuestManagement
            common={common}
            copy={guestsCopy}
            eventId={eventId}
            locale={locale}
            supabase={supabase}
          />
        ) : section === "settings" ? (
          <EventSettings
            common={common}
            copy={copy}
            event={event.data}
            eventsCopy={eventsCopy}
            locale={locale}
            onEventUpdated={setEventData}
            onArchived={async () => {
              await queryClient.invalidateQueries({ queryKey: ["events"] });
              router.replace(`/${locale}/events`);
            }}
            supabase={supabase}
          />
        ) : (
          <EventOverview
            copy={copy}
            dashboard={dashboard}
            event={event.data}
            eventsCopy={eventsCopy}
            locale={locale}
            onTransition={(status) => transition.mutate(status)}
            transitionError={transition.isError}
            transitioning={transition.isPending}
          />
        )}
      </section>
    </HostShell>
  );
}

function EventOverview({
  copy,
  dashboard,
  event,
  eventsCopy,
  locale,
  onTransition,
  transitionError,
  transitioning,
}: {
  copy: Dictionary["workspace"];
  dashboard: UseQueryResult<EventDashboardSummary, Error>;
  event: EventDetail;
  eventsCopy: Dictionary["events"];
  locale: AppLocale;
  onTransition: (status: EditableEventStatus) => void;
  transitionError: boolean;
  transitioning: boolean;
}) {
  const status = eventStatusPresentation(event.status, eventsCopy);
  const total = dashboard.data?.invitationGroups ?? 0;
  const rsvp = dashboard.data?.rsvp;
  const schedule = `${formatEventDate(event.eventDate, locale)} · ${formatLocalTime(event.startTime, locale)}${
    event.endTime ? `–${formatLocalTime(event.endTime, locale)}` : ""
  }`;

  return (
    <>
      <header className="workspace-page-header">
        <div>
          <p className="eyebrow">{copy.overviewEyebrow}</p>
          <h1>{localizedName(event, locale)}</h1>
          <p>
            {schedule} · {localizedVenue(event, locale)}
            {locale === "ar-SA" ? "، " : ", "}
            {event.city}
          </p>
        </div>
        <StatusPill kind="event" label={status.label} status={status.kind} />
      </header>

      {dashboard.isLoading ? (
        <div aria-label={copy.loading} className="workspace-stat-grid">
          <div className="skeleton workspace-stat-skeleton" />
          <div className="skeleton workspace-stat-skeleton" />
          <div className="skeleton workspace-stat-skeleton" />
        </div>
      ) : dashboard.isError || !dashboard.data ? (
        <Banner
          actionLabel={copy.loadErrorTitle}
          kind="danger"
          onAction={() => dashboard.refetch()}
          title={copy.loadErrorDescription}
        />
      ) : (
        <div className="workspace-stat-grid">
          <StatCard
            context={copy.groupsUnit}
            icon="mail"
            label={copy.invitationGroups}
            locale={locale}
            value={dashboard.data.invitationGroups}
          />
          <StatCard
            context={copy.peopleUnit}
            icon="users"
            label={copy.namedGuests}
            locale={locale}
            value={dashboard.data.namedGuests}
          />
          <StatCard
            context={copy.peopleUnit}
            label={copy.expectedAttendees}
            locale={locale}
            tone="accepted"
            value={dashboard.data.expectedAttendees}
          />
        </div>
      )}

      <div className="workspace-grid-two">
        <Card
          subtitle={`${formatNumber(total, locale)} ${copy.groupsUnit}`}
          title={copy.rsvpProgress}
        >
          {total && rsvp ? (
            <ProgressBar
              ariaLabel={copy.rsvpProgress}
              locale={locale}
              segments={[
                {
                  label: copy.accepted,
                  value: rsvp.acceptedGroups,
                  tone: "accepted",
                },
                {
                  label: copy.partial,
                  value: rsvp.partialGroups,
                  tone: "partial",
                },
                {
                  label: copy.declined,
                  value: rsvp.declinedGroups,
                  tone: "declined",
                },
                {
                  label: copy.pending,
                  value: rsvp.pendingGroups,
                  tone: "pending",
                },
              ]}
              total={total}
            />
          ) : (
            <div className="workspace-inline-empty">
              <Icon name="users" size={24} />
              <div>
                <strong>{copy.noGuestsTitle}</strong>
                <p>{copy.noGuestsDescription}</p>
              </div>
            </div>
          )}
        </Card>

        <Card title={copy.detailsTitle}>
          <dl className="workspace-detail-list">
            <div>
              <dt>{copy.eventDate}</dt>
              <dd>{formatEventDate(event.eventDate, locale)}</dd>
            </div>
            <div>
              <dt>{copy.eventTime}</dt>
              <dd className="num">
                {formatLocalTime(event.startTime, locale)}
                {event.endTime
                  ? ` – ${formatLocalTime(event.endTime, locale)}`
                  : null}
              </dd>
            </div>
            <div>
              <dt>{copy.venue}</dt>
              <dd>
                {localizedVenue(event, locale)}
                {locale === "ar-SA" ? "، " : ", "}
                {event.city}
              </dd>
            </div>
            <div>
              <dt>{copy.deadline}</dt>
              <dd>
                {event.rsvpDeadline
                  ? formatEventDate(event.rsvpDeadline, locale)
                  : copy.noDeadline}
              </dd>
            </div>
          </dl>
          {event.mapUrl && isSafeMapUrl(event.mapUrl) ? (
            <a
              className="workspace-map-link"
              href={event.mapUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Icon name="map-pin" size={17} />
              <span>{copy.openMap}</span>
            </a>
          ) : null}
        </Card>
      </div>

      <Card
        actions={
          <StatusPill kind="event" label={status.label} status={status.kind} />
        }
        subtitle={copy.lifecycleDescription}
        title={copy.lifecycleTitle}
      >
        {event.role === "OWNER" && event.availableTransitions.length ? (
          <div className="lifecycle-actions">
            {event.availableTransitions
              .filter(
                (next): next is EditableEventStatus => next !== "ARCHIVED",
              )
              .map((next) => (
                <Button
                  disabled={transitioning}
                  key={next}
                  onClick={() => onTransition(next)}
                  size="sm"
                  variant="secondary"
                >
                  {statusLabel(next, eventsCopy)}
                </Button>
              ))}
          </div>
        ) : (
          <p className="workspace-muted">{copy.noTransitions}</p>
        )}
        {transitionError ? (
          <p className="form-error" role="alert">
            {copy.transitionError}
          </p>
        ) : null}
      </Card>
    </>
  );
}

function EventSettings({
  common,
  copy,
  event,
  eventsCopy,
  locale,
  onEventUpdated,
  onArchived,
  supabase,
}: {
  common: Dictionary["common"];
  copy: Dictionary["workspace"];
  event: EventDetail;
  eventsCopy: Dictionary["events"];
  locale: AppLocale;
  onEventUpdated: (event: EventDetail) => void;
  onArchived: () => Promise<void>;
  supabase: ReturnType<typeof getSupabaseClient>;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const form = useForm<SettingsForm>({ defaultValues: settingsValues(event) });
  useEffect(() => form.reset(settingsValues(event)), [event, form]);

  const save = useMutation({
    mutationFn: (values: SettingsForm) => {
      const parsed = createEventSchema.safeParse({
        ...values,
        nameEn: values.nameEn || undefined,
        venueNameEn: values.venueNameEn || undefined,
        endTime: values.endTime || undefined,
        mapUrl: values.mapUrl || undefined,
        rsvpDeadline: values.rsvpDeadline || undefined,
      });
      if (!parsed.success) throw parsed.error;
      const input: UpdateEventInput = {
        ...parsed.data,
        nameEn: values.nameEn.trim() || null,
        venueNameEn: values.venueNameEn.trim() || null,
        endTime: values.endTime || null,
        mapUrl: values.mapUrl.trim() || null,
        rsvpDeadline: values.rsvpDeadline || null,
      };
      return updateEvent(supabase, event.id, input);
    },
    onSuccess: onEventUpdated,
  });
  const archive = useMutation({
    mutationFn: () => archiveEvent(supabase, event.id),
    onSuccess: onArchived,
  });

  return (
    <>
      <header className="workspace-page-header">
        <div>
          <p className="eyebrow">{copy.settingsEyebrow}</p>
          <h1>{copy.settingsTitle}</h1>
          <p>{copy.settingsDescription}</p>
        </div>
        {event.role === "OWNER" ? (
          <div className="workspace-header-actions">
            <Button
              disabled={save.isPending}
              onClick={() => form.reset(settingsValues(event))}
              variant="secondary"
            >
              {copy.discard}
            </Button>
            <Button
              form="event-settings-form"
              loading={save.isPending}
              type="submit"
            >
              {copy.saveChanges}
            </Button>
          </div>
        ) : null}
      </header>

      {event.role !== "OWNER" ? (
        <Banner icon="lock" kind="warning" title={copy.ownerOnly} />
      ) : (
        <form
          className="workspace-settings-grid"
          id="event-settings-form"
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <Card title={copy.informationTitle}>
            <div className="event-form event-form--grid">
              <Field id="settings-nameAr" label={eventsCopy.nameAr} required>
                <Input
                  {...form.register("nameAr", { required: true, minLength: 2 })}
                  id="settings-nameAr"
                />
              </Field>
              <Field id="settings-nameEn" label={eventsCopy.nameEn}>
                <Input
                  {...form.register("nameEn")}
                  dir="ltr"
                  id="settings-nameEn"
                />
              </Field>
              <Field
                id="settings-eventType"
                label={eventsCopy.eventType}
                required
              >
                <Select
                  {...form.register("eventType")}
                  id="settings-eventType"
                  options={eventTypeOptions(eventsCopy)}
                />
              </Field>
              <Field
                id="settings-eventDate"
                label={eventsCopy.eventDate}
                required
              >
                <Input
                  {...form.register("eventDate", { required: true })}
                  id="settings-eventDate"
                  mono
                  type="date"
                />
              </Field>
              <div className="form-row">
                <Field
                  id="settings-startTime"
                  label={eventsCopy.startTime}
                  required
                >
                  <Input
                    {...form.register("startTime", { required: true })}
                    id="settings-startTime"
                    mono
                    type="time"
                  />
                </Field>
                <Field id="settings-endTime" label={eventsCopy.endTime}>
                  <Input
                    {...form.register("endTime")}
                    id="settings-endTime"
                    mono
                    type="time"
                  />
                </Field>
              </div>
              <Field
                id="settings-venueNameAr"
                label={eventsCopy.venueNameAr}
                required
              >
                <Input
                  {...form.register("venueNameAr", {
                    required: true,
                    minLength: 2,
                  })}
                  id="settings-venueNameAr"
                />
              </Field>
              <Field id="settings-venueNameEn" label={eventsCopy.venueNameEn}>
                <Input
                  {...form.register("venueNameEn")}
                  dir="ltr"
                  id="settings-venueNameEn"
                />
              </Field>
              <div className="form-row">
                <Field id="settings-city" label={eventsCopy.city} required>
                  <Input
                    {...form.register("city", { required: true, minLength: 2 })}
                    id="settings-city"
                  />
                </Field>
                <Field
                  id="settings-timezone"
                  label={eventsCopy.timezone}
                  required
                >
                  <Select
                    {...form.register("timezone")}
                    id="settings-timezone"
                    options={[
                      {
                        value: "Asia/Riyadh",
                        label: eventsCopy.timezoneRiyadh,
                      },
                      { value: "Asia/Dubai", label: eventsCopy.timezoneDubai },
                    ]}
                  />
                </Field>
              </div>
              <Field
                hint={eventsCopy.mapHint}
                id="settings-mapUrl"
                label={eventsCopy.mapUrl}
              >
                <Input
                  {...form.register("mapUrl")}
                  dir="ltr"
                  icon="map-pin"
                  id="settings-mapUrl"
                  type="url"
                />
              </Field>
            </div>
          </Card>

          <div className="workspace-settings-side">
            <Card title={copy.rsvpTitle}>
              <div className="event-settings-stack">
                <Field
                  id="settings-rsvpDeadline"
                  label={eventsCopy.rsvpDeadline}
                >
                  <Input
                    {...form.register("rsvpDeadline")}
                    id="settings-rsvpDeadline"
                    mono
                    type="date"
                  />
                </Field>
                <Switch
                  {...form.register("allowRsvpEdits")}
                  description={eventsCopy.allowRsvpEditsDescription}
                  label={eventsCopy.allowRsvpEdits}
                />
                <Switch
                  {...form.register("qrEnabled")}
                  description={eventsCopy.qrDescription}
                  label={eventsCopy.qrEnabled}
                />
              </div>
            </Card>
            <Card
              className="workspace-danger-card"
              subtitle={copy.dangerDescription}
              title={copy.dangerTitle}
            >
              <Button
                icon="archive"
                onClick={() => setArchiveOpen(true)}
                variant="danger-soft"
              >
                {copy.archive}
              </Button>
            </Card>
          </div>
        </form>
      )}

      {save.isError ? (
        <div className="app-toast-region">
          <Toast
            dismissLabel={common.close}
            kind="error"
            onDismiss={() => save.reset()}
            title={copy.saveError}
          />
        </div>
      ) : save.isSuccess ? (
        <div className="app-toast-region">
          <Toast
            dismissLabel={common.close}
            onDismiss={() => save.reset()}
            title={copy.saved}
          />
        </div>
      ) : null}

      <Dialog
        closeLabel={common.close}
        description={copy.archiveDescription}
        footer={
          <>
            <Button onClick={() => setArchiveOpen(false)} variant="secondary">
              {common.cancel}
            </Button>
            <Button
              loading={archive.isPending}
              onClick={() => archive.mutate()}
              variant="danger"
            >
              {copy.archiveConfirm}
            </Button>
          </>
        }
        onClose={() => setArchiveOpen(false)}
        open={archiveOpen}
        title={copy.archiveTitle}
      >
        <p>{localizedName(event, locale)}</p>
        {archive.isError ? (
          <p className="form-error" role="alert">
            {copy.archiveError}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div aria-label={label} className="workspace-loading">
      <div className="skeleton workspace-heading-skeleton" />
      <div className="workspace-stat-grid">
        <div className="skeleton workspace-stat-skeleton" />
        <div className="skeleton workspace-stat-skeleton" />
        <div className="skeleton workspace-stat-skeleton" />
      </div>
      <div className="workspace-grid-two">
        <div className="skeleton workspace-panel-skeleton" />
        <div className="skeleton workspace-panel-skeleton" />
      </div>
    </div>
  );
}

function settingsValues(event: EventDetail): SettingsForm {
  return {
    nameAr: event.nameAr,
    nameEn: event.nameEn ?? "",
    eventType: event.eventType,
    eventDate: event.eventDate,
    startTime: event.startTime,
    endTime: event.endTime ?? "",
    timezone: event.timezone,
    venueNameAr: event.venueNameAr,
    venueNameEn: event.venueNameEn ?? "",
    city: event.city,
    mapUrl: event.mapUrl ?? "",
    rsvpDeadline: event.rsvpDeadline ?? "",
    allowRsvpEdits: event.allowRsvpEdits,
    qrEnabled: event.qrEnabled,
  };
}

function eventTypeOptions(copy: Dictionary["events"]) {
  return [
    { value: "WEDDING", label: copy.typeWedding },
    { value: "ENGAGEMENT", label: copy.typeEngagement },
    { value: "RECEPTION", label: copy.typeReception },
    { value: "GRADUATION", label: copy.typeGraduation },
    { value: "PRIVATE_EVENT", label: copy.typePrivate },
    { value: "OTHER", label: copy.typeOther },
  ];
}

function localizedName(
  event: Pick<EventSummary, "nameAr" | "nameEn">,
  locale: AppLocale,
): string {
  return locale === "en" ? (event.nameEn ?? event.nameAr) : event.nameAr;
}

function localizedVenue(event: EventDetail, locale: AppLocale): string {
  return locale === "en"
    ? (event.venueNameEn ?? event.venueNameAr)
    : event.venueNameAr;
}

function eventStatusPresentation(
  status: EventDetail["status"],
  copy: Dictionary["events"],
): { kind: string; label: string } {
  return {
    DRAFT: { kind: "upcoming", label: copy.statusDraft },
    ACTIVE: { kind: "upcoming", label: copy.statusActive },
    RSVP_OPEN: { kind: "rsvp-open", label: copy.statusRsvpOpen },
    RSVP_CLOSED: { kind: "rsvp-closed", label: copy.statusRsvpClosed },
    EVENT_DAY: { kind: "today", label: copy.statusToday },
    COMPLETED: { kind: "completed", label: copy.statusCompleted },
    ARCHIVED: { kind: "archived", label: copy.statusArchived },
  }[status];
}

function statusLabel(
  status: EventDetail["status"],
  copy: Dictionary["events"],
): string {
  return eventStatusPresentation(status, copy).label;
}

function formatEventDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function formatLocalTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`1970-01-01T${value}:00.000Z`));
}

function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(
    locale === "ar-SA" ? "ar-SA-u-nu-arab" : "en",
  ).format(value);
}
