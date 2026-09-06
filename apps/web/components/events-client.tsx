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
  Input,
  StatusPill,
} from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import {
  createEvent as requestCreateEvent,
  developmentAuthBypassEnabled,
  listEvents,
} from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase";

const eventStatus: Record<EventSummary["status"], string> = {
  DRAFT: "upcoming",
  ACTIVE: "upcoming",
  RSVP_OPEN: "rsvp-open",
  RSVP_CLOSED: "rsvp-closed",
  EVENT_DAY: "today",
  COMPLETED: "completed",
  ARCHIVED: "archived",
};

type EventFormInput = z.input<typeof createEventSchema>;

export function EventsClient() {
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
      city: "الرياض",
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
    router.push("/");
  };

  return (
    <main className="events-shell">
      <aside className="events-side">
        <a className="wordmark" href="/">
          <span>دعوة</span>
          <small>DAWAH</small>
        </a>
        <nav aria-label="التنقل الرئيسي">
          <a aria-current="page" href="/events">
            المناسبات
          </a>
        </nav>
        <Button fullWidth onClick={signOut} variant="ghost">
          تسجيل الخروج
        </Button>
      </aside>
      <section className="events-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">لوحة الإدارة</p>
            <h1>المناسبات</h1>
            <p>أنشئ مناسبة أو افتح مناسبة قائمة لإدارة الدعوات والحضور.</p>
          </div>
          <Button icon="plus" onClick={() => setCreateOpen(true)}>
            إنشاء مناسبة
          </Button>
        </header>

        {!apiAvailable ? (
          <Card tone="sunken">
            <p className="form-error">
              لم يتم إعداد تسجيل الدخول. أضف قيم Supabase إلى ملف البيئة ثم أعد
              تشغيل التطبيق.
            </p>
          </Card>
        ) : events.isLoading ? (
          <div aria-label="جارٍ تحميل المناسبات" className="event-grid">
            <div className="skeleton event-skeleton" />
            <div className="skeleton event-skeleton" />
          </div>
        ) : events.isError ? (
          <EmptyState
            icon="circle-alert"
            title="تعذر تحميل المناسبات"
            description="تحقق من اتصال واجهة API ثم حاول مرة أخرى."
            action={
              <Button onClick={() => events.refetch()} variant="secondary">
                إعادة المحاولة
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
                    locale="ar"
                    status={eventStatus[event.status]}
                  />
                }
              >
                <article className="event-card">
                  <p className="eyebrow">
                    {event.eventType === "WEDDING"
                      ? "حفل زواج"
                      : event.eventType}
                  </p>
                  <h2>{event.nameAr}</h2>
                  <dl>
                    <div>
                      <dt>التاريخ</dt>
                      <dd>
                        {new Intl.DateTimeFormat("ar-SA", {
                          dateStyle: "long",
                          timeZone: event.timezone,
                        }).format(new Date(`${event.eventDate}T12:00:00Z`))}
                      </dd>
                    </div>
                    <div>
                      <dt>الموقع</dt>
                      <dd>
                        {event.venueNameAr}، {event.city}
                      </dd>
                    </div>
                  </dl>
                  <Button iconEnd="arrow-left" variant="secondary">
                    فتح المناسبة
                  </Button>
                </article>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="calendar"
            title="لا توجد مناسبات بعد"
            description="أنشئ المناسبة الأولى، ثم أضف مجموعات الدعوات وحدد من تشملهم كل دعوة."
            action={
              <Button icon="plus" onClick={() => setCreateOpen(true)}>
                إنشاء المناسبة الأولى
              </Button>
            }
          />
        )}
      </section>

      <Dialog
        description="أدخل المعلومات الأساسية. يمكن تعديل إعدادات الدعوات لاحقًا."
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)} variant="secondary">
              إلغاء
            </Button>
            <Button
              form="create-event-form"
              loading={createEvent.isPending}
              type="submit"
            >
              حفظ المناسبة
            </Button>
          </>
        }
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        title="إنشاء مناسبة"
      >
        <form
          className="event-form"
          id="create-event-form"
          onSubmit={form.handleSubmit((input) => createEvent.mutate(input))}
        >
          <Field
            id="nameAr"
            label="اسم المناسبة بالعربية"
            error={form.formState.errors.nameAr?.message}
            required
          >
            <Input
              {...form.register("nameAr")}
              id="nameAr"
              invalid={Boolean(form.formState.errors.nameAr)}
              placeholder="حفل زواج خالد ونورة"
            />
          </Field>
          <Field
            id="eventDate"
            label="تاريخ المناسبة"
            error={form.formState.errors.eventDate?.message}
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
              label="وقت البدء"
              error={form.formState.errors.startTime?.message}
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
              label="وقت الانتهاء"
              error={form.formState.errors.endTime?.message}
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
            label="اسم القاعة أو الموقع"
            error={form.formState.errors.venueNameAr?.message}
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
            label="المدينة"
            error={form.formState.errors.city?.message}
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
            label="آخر موعد للرد"
            error={form.formState.errors.rsvpDeadline?.message}
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
              تعذر حفظ المناسبة. تحقق من البيانات والاتصال ثم حاول مرة أخرى.
            </p>
          ) : null}
        </form>
      </Dialog>
    </main>
  );
}
