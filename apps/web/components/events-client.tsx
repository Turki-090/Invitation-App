"use client";

import type { CreateEventInput, EventSummary } from "@dawah/api-contract";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  HostShell,
  Icon,
  IconButton,
  StatusPill,
  Toast,
} from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EventWizard } from "@/components/event-wizard";
import { LocaleSwitcher } from "@/components/locale-switcher";
import type { AppLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  archiveEvent as requestArchiveEvent,
  createEvent as requestCreateEvent,
  developmentAuthBypassEnabled,
  listEvents,
  recoverEvent as requestRecoverEvent,
} from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase";

const eventStatus: Record<
  EventSummary["status"],
  { status: string; label: keyof Dictionary["events"] }
> = {
  DRAFT: { status: "upcoming", label: "statusDraft" },
  ACTIVE: { status: "upcoming", label: "statusActive" },
  RSVP_OPEN: { status: "rsvp-open", label: "statusRsvpOpen" },
  RSVP_CLOSED: { status: "rsvp-closed", label: "statusRsvpClosed" },
  EVENT_DAY: { status: "today", label: "statusToday" },
  COMPLETED: { status: "completed", label: "statusCompleted" },
  ARCHIVED: { status: "archived", label: "statusArchived" },
};

interface EventsClientProps {
  locale: AppLocale;
  copy: Dictionary["events"];
  common: Dictionary["common"];
  shellCopy: Dictionary["shell"];
}

interface ArchivedNotice {
  id: string;
  name: string;
}

export function EventsClient({
  locale,
  copy,
  common,
  shellCopy,
}: EventsClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<EventSummary | null>(null);
  const [archivedNotice, setArchivedNotice] = useState<ArchivedNotice | null>(
    null,
  );
  const supabase = getSupabaseClient();
  const apiAvailable = Boolean(supabase) || developmentAuthBypassEnabled;
  const events = useQuery({
    queryKey: ["events"],
    enabled: apiAvailable,
    queryFn: () => listEvents(supabase),
  });
  const createEvent = useMutation({
    mutationFn: (input: CreateEventInput) =>
      requestCreateEvent(supabase, input),
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      setCreateOpen(false);
      router.push(`/${locale}/events/${event.id}`);
    },
  });
  const archiveEvent = useMutation({
    mutationFn: (event: EventSummary) =>
      requestArchiveEvent(supabase, event.id),
    onSuccess: async (_, event) => {
      setArchivedNotice({
        id: event.id,
        name: localizedName(event, locale),
      });
      setArchiveTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
  const recoverEvent = useMutation({
    mutationFn: (eventId: string) => requestRecoverEvent(supabase, eventId),
    onSuccess: async () => {
      setArchivedNotice(null);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const signOut = async () => {
    await supabase?.auth.signOut();
    router.push(`/${locale}`);
  };

  return (
    <HostShell
      brand={
        <Link
          aria-label={common.homeLabel}
          className="wordmark"
          href={`/${locale}`}
        >
          <span>{common.wordmark}</span>
          <small>{common.wordmarkLatin}</small>
        </Link>
      }
      collapseLabel={shellCopy.collapse}
      compactUtility={
        <IconButton label={copy.signOut} name="log-out" onClick={signOut} />
      }
      expandLabel={shellCopy.expand}
      items={[
        {
          id: "events",
          label: copy.title,
          href: `/${locale}/events`,
          icon: "calendar",
          active: true,
        },
      ]}
      navigationLabel={copy.navigationLabel}
      topbar={
        <LocaleSwitcher
          arabicLabel={common.arabic}
          englishLabel={common.english}
          label={common.language}
          locale={locale}
        />
      }
      utility={
        <Button fullWidth icon="log-out" onClick={signOut} variant="ghost">
          {copy.signOut}
        </Button>
      }
    >
      <section className="events-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.intro}</p>
          </div>
          <Button icon="plus" onClick={() => setCreateOpen(true)}>
            {copy.create}
          </Button>
        </header>

        {!apiAvailable ? (
          <Card tone="sunken">
            <p className="form-error">{copy.setupMissing}</p>
          </Card>
        ) : events.isLoading ? (
          <div aria-label={copy.loading} className="event-grid">
            <div className="skeleton event-skeleton" />
            <div className="skeleton event-skeleton" />
          </div>
        ) : events.isError ? (
          <EmptyState
            action={
              <Button onClick={() => events.refetch()} variant="secondary">
                {common.retry}
              </Button>
            }
            description={copy.loadErrorDescription}
            icon="circle-alert"
            title={copy.loadErrorTitle}
          />
        ) : events.data?.length ? (
          <div className="event-grid">
            {events.data.map((event) => (
              <Card
                actions={
                  <StatusPill
                    kind="event"
                    label={copy[eventStatus[event.status].label]}
                    status={eventStatus[event.status].status}
                  />
                }
                key={event.id}
              >
                <article className="event-card">
                  <p className="eyebrow">{eventTypeLabel(event, copy)}</p>
                  <h2>{localizedName(event, locale)}</h2>
                  <dl>
                    <div>
                      <dt>{copy.date}</dt>
                      <dd>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "long",
                          timeZone: "UTC",
                        }).format(new Date(`${event.eventDate}T12:00:00Z`))}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.location}</dt>
                      <dd>
                        {localizedVenue(event, locale)}
                        {locale === "ar-SA" ? "، " : ", "}
                        {event.city}
                      </dd>
                    </div>
                  </dl>
                  <div className="event-card__actions">
                    <Link
                      className="dawah-button dawah-button--secondary dawah-button--md"
                      href={`/${locale}/events/${event.id}`}
                    >
                      <span>{copy.open}</span>
                      <Icon flipRtl name="arrow-left" />
                    </Link>
                    {event.role === "OWNER" ? (
                      <Button
                        icon="archive"
                        onClick={() => setArchiveTarget(event)}
                        size="sm"
                        variant="ghost"
                      >
                        {copy.archive}
                      </Button>
                    ) : null}
                  </div>
                </article>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              <Button icon="plus" onClick={() => setCreateOpen(true)}>
                {copy.emptyAction}
              </Button>
            }
            description={copy.emptyDescription}
            icon="calendar"
            title={copy.emptyTitle}
          />
        )}
      </section>

      <EventWizard
        common={common}
        copy={copy}
        loading={createEvent.isPending}
        locale={locale}
        onClose={() => setCreateOpen(false)}
        onSubmit={(input) => createEvent.mutate(input)}
        open={createOpen}
        submitError={createEvent.isError}
      />

      <Dialog
        closeLabel={common.close}
        description={copy.archiveDescription}
        footer={
          <>
            <Button onClick={() => setArchiveTarget(null)} variant="secondary">
              {common.cancel}
            </Button>
            <Button
              loading={archiveEvent.isPending}
              onClick={() =>
                archiveTarget && archiveEvent.mutate(archiveTarget)
              }
              variant="danger"
            >
              {copy.archiveConfirm}
            </Button>
          </>
        }
        onClose={() => setArchiveTarget(null)}
        open={Boolean(archiveTarget)}
        title={copy.archiveTitle}
      >
        <p>{archiveTarget ? localizedName(archiveTarget, locale) : null}</p>
        {archiveEvent.isError ? (
          <p className="form-error" role="alert">
            {copy.archiveError}
          </p>
        ) : null}
      </Dialog>

      {archivedNotice ? (
        <div className="app-toast-region">
          <Toast
            action={
              <Button
                loading={recoverEvent.isPending}
                onClick={() => recoverEvent.mutate(archivedNotice.id)}
                size="sm"
                variant="secondary"
              >
                {copy.recover}
              </Button>
            }
            description={archivedNotice.name}
            dismissLabel={copy.dismiss}
            kind={recoverEvent.isError ? "error" : "success"}
            onDismiss={() => setArchivedNotice(null)}
            title={
              recoverEvent.isError ? copy.recoverError : copy.archiveSuccess
            }
          />
        </div>
      ) : null}
    </HostShell>
  );
}

function localizedName(event: EventSummary, locale: AppLocale): string {
  return locale === "en" ? (event.nameEn ?? event.nameAr) : event.nameAr;
}

function localizedVenue(event: EventSummary, locale: AppLocale): string {
  return locale === "en"
    ? (event.venueNameEn ?? event.venueNameAr)
    : event.venueNameAr;
}

function eventTypeLabel(
  event: EventSummary,
  copy: Dictionary["events"],
): string {
  return {
    WEDDING: copy.typeWedding,
    ENGAGEMENT: copy.typeEngagement,
    RECEPTION: copy.typeReception,
    GRADUATION: copy.typeGraduation,
    PRIVATE_EVENT: copy.typePrivate,
    OTHER: copy.typeOther,
  }[event.eventType];
}
