"use client";

import {
  createEventSchema,
  type CreateEventInput,
  type EventSummary,
} from "@dawah/api-contract";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  HostShell,
  IconButton,
  Input,
  StatusPill,
} from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { LocaleSwitcher } from "@/components/locale-switcher";
import type { AppLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  createEvent as requestCreateEvent,
  developmentAuthBypassEnabled,
  listEvents,
} from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase";

const eventStatus: Record<
  EventSummary["status"],
  { status: string; label: keyof Dictionary["events"] }
> = {
  DRAFT: { status: "upcoming", label: "statusUpcoming" },
  ACTIVE: { status: "upcoming", label: "statusUpcoming" },
  RSVP_OPEN: { status: "rsvp-open", label: "statusRsvpOpen" },
  RSVP_CLOSED: { status: "rsvp-closed", label: "statusRsvpClosed" },
  EVENT_DAY: { status: "today", label: "statusToday" },
  COMPLETED: { status: "completed", label: "statusCompleted" },
  ARCHIVED: { status: "archived", label: "statusArchived" },
};

type EventFormInput = z.input<typeof createEventSchema>;

interface EventsClientProps {
  locale: AppLocale;
  copy: Dictionary["events"];
  common: Dictionary["common"];
  shellCopy: Dictionary["shell"];
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
  const supabase = getSupabaseClient();
  const apiAvailable = Boolean(supabase) || developmentAuthBypassEnabled;
  const events = useQuery({
    queryKey: ["events"],
    enabled: apiAvailable,
    queryFn: () => listEvents(supabase),
  });
  const form = useForm<EventFormInput, unknown, CreateEventInput>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      nameAr: "",
      nameEn: undefined,
      eventType: "WEDDING",
      eventDate: "",
      startTime: "20:00",
      endTime: undefined,
      timezone: "Asia/Riyadh",
      venueNameAr: "",
      venueNameEn: undefined,
      city: copy.defaultCity,
      mapUrl: undefined,
      rsvpDeadline: undefined,
      allowRsvpEdits: true,
    },
  });
  const createEvent = useMutation({
    mutationFn: (input: CreateEventInput) =>
      requestCreateEvent(supabase, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      setCreateOpen(false);
      form.reset();
    },
  });

  const signOut = async () => {
    await supabase?.auth.signOut();
    router.push(`/${locale}`);
  };

  return (
    <HostShell
      brand={
        <a
          aria-label={common.homeLabel}
          className="wordmark"
          href={`/${locale}`}
        >
          <span>{common.wordmark}</span>
          <small>{common.wordmarkLatin}</small>
        </a>
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
            icon="circle-alert"
            title={copy.loadErrorTitle}
            description={copy.loadErrorDescription}
            action={
              <Button onClick={() => events.refetch()} variant="secondary">
                {common.retry}
              </Button>
            }
          />
        ) : events.data?.length ? (
          <div className="event-grid">
            {events.data.map((event) => (
              <Card
                key={event.id}
                actions={
                  <StatusPill
                    kind="event"
                    label={copy[eventStatus[event.status].label]}
                    status={eventStatus[event.status].status}
                  />
                }
              >
                <article className="event-card">
                  <p className="eyebrow">
                    {event.eventType === "WEDDING"
                      ? copy.wedding
                      : event.eventType}
                  </p>
                  <h2>
                    {locale === "en"
                      ? (event.nameEn ?? event.nameAr)
                      : event.nameAr}
                  </h2>
                  <dl>
                    <div>
                      <dt>{copy.date}</dt>
                      <dd>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "long",
                          timeZone: event.timezone,
                        }).format(new Date(`${event.eventDate}T12:00:00Z`))}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.location}</dt>
                      <dd>
                        {event.venueNameAr}
                        {locale === "ar-SA" ? "، " : ", "}
                        {event.city}
                      </dd>
                    </div>
                  </dl>
                  <Button iconEnd="arrow-left" variant="secondary">
                    {copy.open}
                  </Button>
                </article>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="calendar"
            title={copy.emptyTitle}
            description={copy.emptyDescription}
            action={
              <Button icon="plus" onClick={() => setCreateOpen(true)}>
                {copy.emptyAction}
              </Button>
            }
          />
        )}
      </section>

      <Dialog
        closeLabel={common.close}
        description={copy.dialogDescription}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)} variant="secondary">
              {common.cancel}
            </Button>
            <Button
              form="create-event-form"
              loading={createEvent.isPending}
              type="submit"
            >
              {copy.save}
            </Button>
          </>
        }
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        title={copy.dialogTitle}
      >
        <form
          className="event-form"
          id="create-event-form"
          onSubmit={form.handleSubmit((input) => createEvent.mutate(input))}
        >
          <Field
            id="nameAr"
            label={copy.nameAr}
            error={form.formState.errors.nameAr ? copy.invalidField : undefined}
            required
          >
            <Input
              {...form.register("nameAr")}
              id="nameAr"
              invalid={Boolean(form.formState.errors.nameAr)}
              placeholder={copy.nameArPlaceholder}
            />
          </Field>
          <Field
            id="eventDate"
            label={copy.eventDate}
            error={
              form.formState.errors.eventDate ? copy.invalidField : undefined
            }
            required
          >
            <Input
              {...form.register("eventDate")}
              className="ltr"
              id="eventDate"
              invalid={Boolean(form.formState.errors.eventDate)}
              type="date"
            />
          </Field>
          <div className="form-row">
            <Field
              id="startTime"
              label={copy.startTime}
              error={
                form.formState.errors.startTime ? copy.invalidField : undefined
              }
              required
            >
              <Input
                {...form.register("startTime")}
                className="ltr"
                id="startTime"
                invalid={Boolean(form.formState.errors.startTime)}
                type="time"
              />
            </Field>
            <Field
              id="endTime"
              label={copy.endTime}
              error={
                form.formState.errors.endTime ? copy.invalidField : undefined
              }
            >
              <Input
                {...form.register("endTime")}
                className="ltr"
                id="endTime"
                invalid={Boolean(form.formState.errors.endTime)}
                type="time"
              />
            </Field>
          </div>
          <Field
            id="venueNameAr"
            label={copy.venueNameAr}
            error={
              form.formState.errors.venueNameAr ? copy.invalidField : undefined
            }
            required
          >
            <Input
              {...form.register("venueNameAr")}
              id="venueNameAr"
              invalid={Boolean(form.formState.errors.venueNameAr)}
            />
          </Field>
          <Field
            id="city"
            label={copy.city}
            error={form.formState.errors.city ? copy.invalidField : undefined}
            required
          >
            <Input
              {...form.register("city")}
              id="city"
              invalid={Boolean(form.formState.errors.city)}
            />
          </Field>
          <Field
            id="rsvpDeadline"
            label={copy.rsvpDeadline}
            error={
              form.formState.errors.rsvpDeadline ? copy.invalidField : undefined
            }
          >
            <Input
              {...form.register("rsvpDeadline")}
              className="ltr"
              id="rsvpDeadline"
              invalid={Boolean(form.formState.errors.rsvpDeadline)}
              type="date"
            />
          </Field>
          {createEvent.isError ? (
            <p className="form-error" role="alert">
              {copy.saveError}
            </p>
          ) : null}
        </form>
      </Dialog>
    </HostShell>
  );
}
