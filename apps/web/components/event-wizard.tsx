"use client";

import { createEventSchema, type CreateEventInput } from "@dawah/api-contract";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Banner,
  Button,
  Card,
  ChoiceCard,
  Dialog,
  Field,
  Input,
  Select,
  Switch,
} from "@dawah/ui";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";

type EventFormInput = z.input<typeof createEventSchema>;

interface EventWizardProps {
  locale: AppLocale;
  copy: Dictionary["events"];
  common: Dictionary["common"];
  open: boolean;
  loading: boolean;
  submitError: boolean;
  onClose: () => void;
  onSubmit: (input: CreateEventInput) => void;
}

const stepFields: ReadonlyArray<readonly (keyof EventFormInput)[]> = [
  ["eventType"],
  [
    "nameAr",
    "nameEn",
    "eventDate",
    "startTime",
    "endTime",
    "timezone",
    "venueNameAr",
    "venueNameEn",
    "city",
    "mapUrl",
  ],
  ["rsvpDeadline", "allowRsvpEdits", "qrEnabled"],
  [],
];

export function EventWizard({
  locale,
  copy,
  common,
  open,
  loading,
  submitError,
  onClose,
  onSubmit,
}: EventWizardProps) {
  const [step, setStep] = useState(0);
  const form = useForm<EventFormInput, unknown, CreateEventInput>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      nameAr: "",
      nameEn: "",
      eventType: "WEDDING",
      eventDate: "",
      startTime: "20:00",
      endTime: "",
      timezone: "Asia/Riyadh",
      venueNameAr: "",
      venueNameEn: "",
      city: copy.defaultCity,
      mapUrl: "",
      rsvpDeadline: "",
      allowRsvpEdits: true,
      qrEnabled: false,
    },
  });
  const selectedType = form.watch("eventType");
  const values = form.watch();
  const steps = [
    copy.stepType,
    copy.stepDetails,
    copy.stepRsvp,
    copy.stepReview,
  ];
  const types = [
    {
      value: "WEDDING" as const,
      title: copy.typeWedding,
      description: copy.typeWeddingDescription,
      icon: "sparkles" as const,
    },
    {
      value: "ENGAGEMENT" as const,
      title: copy.typeEngagement,
      description: copy.typeEngagementDescription,
      icon: "circle-check" as const,
    },
    {
      value: "RECEPTION" as const,
      title: copy.typeReception,
      description: copy.typeReceptionDescription,
      icon: "users" as const,
    },
    {
      value: "GRADUATION" as const,
      title: copy.typeGraduation,
      description: copy.typeGraduationDescription,
      icon: "file-text" as const,
    },
    {
      value: "PRIVATE_EVENT" as const,
      title: copy.typePrivate,
      description: copy.typePrivateDescription,
      icon: "lock" as const,
    },
    {
      value: "OTHER" as const,
      title: copy.typeOther,
      description: copy.typeOtherDescription,
      icon: "more-horizontal" as const,
    },
  ];

  const close = () => {
    setStep(0);
    form.reset();
    onClose();
  };
  const next = async () => {
    const valid = await form.trigger(stepFields[step] ?? []);
    if (valid) setStep((current) => Math.min(current + 1, 3));
  };
  const errorFor = (field: keyof EventFormInput) =>
    form.formState.errors[field] ? copy.invalidField : undefined;
  const typeLabel =
    types.find((type) => type.value === selectedType)?.title ?? copy.typeOther;
  const formattedDate = values.eventDate
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${values.eventDate}T12:00:00.000Z`))
    : "—";

  return (
    <Dialog
      closeLabel={common.close}
      description={copy.dialogDescription}
      footer={
        <>
          <Button onClick={close} variant="ghost">
            {common.cancel}
          </Button>
          {step > 0 ? (
            <Button
              disabled={loading}
              onClick={() => setStep((current) => current - 1)}
              variant="secondary"
            >
              {copy.back}
            </Button>
          ) : null}
          {step < 3 ? (
            <Button iconEnd="arrow-left" onClick={next}>
              {copy.next}
            </Button>
          ) : (
            <Button
              form="event-wizard-form"
              icon="sparkles"
              loading={loading}
              type="submit"
              variant="accent"
            >
              {copy.finish}
            </Button>
          )}
        </>
      }
      onClose={close}
      open={open}
      title={copy.dialogTitle}
    >
      <div className="event-wizard">
        <p className="event-wizard__count num">
          {copy.stepOf
            .replace("{current}", String(step + 1))
            .replace("{total}", "4")}
        </p>
        <ol aria-label={copy.dialogTitle} className="event-wizard__steps">
          {steps.map((label, index) => (
            <li
              aria-current={index === step ? "step" : undefined}
              className={index <= step ? "is-complete" : undefined}
              key={label}
            >
              <span aria-hidden="true" />
              <small>{label}</small>
            </li>
          ))}
        </ol>

        <form id="event-wizard-form" onSubmit={form.handleSubmit(onSubmit)}>
          {step === 0 ? (
            <div
              aria-label={copy.eventType}
              className="event-type-grid"
              role="radiogroup"
            >
              {types.map((type) => (
                <ChoiceCard
                  description={type.description}
                  icon={type.icon}
                  key={type.value}
                  onClick={() =>
                    form.setValue("eventType", type.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  selected={selectedType === type.value}
                  title={type.title}
                />
              ))}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="event-form event-form--grid">
              <Field
                error={errorFor("nameAr")}
                id="create-nameAr"
                label={copy.nameAr}
                required
              >
                <Input
                  {...form.register("nameAr")}
                  id="create-nameAr"
                  placeholder={copy.nameArPlaceholder}
                />
              </Field>
              <Field
                error={errorFor("nameEn")}
                id="create-nameEn"
                label={copy.nameEn}
              >
                <Input
                  {...form.register("nameEn")}
                  dir="ltr"
                  id="create-nameEn"
                  placeholder={copy.nameEnPlaceholder}
                />
              </Field>
              <Field
                error={errorFor("eventDate")}
                id="create-eventDate"
                label={copy.eventDate}
                required
              >
                <Input
                  {...form.register("eventDate")}
                  id="create-eventDate"
                  mono
                  type="date"
                />
              </Field>
              <div className="form-row">
                <Field
                  error={errorFor("startTime")}
                  id="create-startTime"
                  label={copy.startTime}
                  required
                >
                  <Input
                    {...form.register("startTime")}
                    id="create-startTime"
                    mono
                    type="time"
                  />
                </Field>
                <Field
                  error={errorFor("endTime")}
                  id="create-endTime"
                  label={copy.endTime}
                >
                  <Input
                    {...form.register("endTime")}
                    id="create-endTime"
                    mono
                    type="time"
                  />
                </Field>
              </div>
              <Field
                error={errorFor("venueNameAr")}
                id="create-venueNameAr"
                label={copy.venueNameAr}
                required
              >
                <Input
                  {...form.register("venueNameAr")}
                  id="create-venueNameAr"
                />
              </Field>
              <Field
                error={errorFor("venueNameEn")}
                id="create-venueNameEn"
                label={copy.venueNameEn}
              >
                <Input
                  {...form.register("venueNameEn")}
                  dir="ltr"
                  id="create-venueNameEn"
                />
              </Field>
              <div className="form-row">
                <Field
                  error={errorFor("city")}
                  id="create-city"
                  label={copy.city}
                  required
                >
                  <Input {...form.register("city")} id="create-city" />
                </Field>
                <Field
                  error={errorFor("timezone")}
                  id="create-timezone"
                  label={copy.timezone}
                  required
                >
                  <Select
                    {...form.register("timezone")}
                    id="create-timezone"
                    options={[
                      { value: "Asia/Riyadh", label: copy.timezoneRiyadh },
                      { value: "Asia/Dubai", label: copy.timezoneDubai },
                    ]}
                  />
                </Field>
              </div>
              <Field
                error={errorFor("mapUrl")}
                hint={copy.mapHint}
                id="create-mapUrl"
                label={copy.mapUrl}
              >
                <Input
                  {...form.register("mapUrl")}
                  dir="ltr"
                  icon="map-pin"
                  id="create-mapUrl"
                  placeholder="https://maps.app.goo.gl/…"
                  type="url"
                />
              </Field>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="event-settings-stack">
              <Field
                error={errorFor("rsvpDeadline")}
                id="create-rsvpDeadline"
                label={copy.rsvpDeadline}
              >
                <Input
                  {...form.register("rsvpDeadline")}
                  id="create-rsvpDeadline"
                  mono
                  type="date"
                />
              </Field>
              <Switch
                {...form.register("allowRsvpEdits")}
                description={copy.allowRsvpEditsDescription}
                label={copy.allowRsvpEdits}
              />
              <Switch
                {...form.register("qrEnabled")}
                description={copy.qrDescription}
                label={copy.qrEnabled}
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="event-review">
              <div>
                <h3>{copy.reviewTitle}</h3>
                <p>{copy.reviewDescription}</p>
              </div>
              <Card tone="sunken">
                <dl className="event-review__list">
                  <div>
                    <dt>{copy.eventType}</dt>
                    <dd>{typeLabel}</dd>
                  </div>
                  <div>
                    <dt>{copy.nameAr}</dt>
                    <dd>{values.nameAr || "—"}</dd>
                  </div>
                  <div>
                    <dt>{copy.reviewSchedule}</dt>
                    <dd className="num">
                      {formattedDate} · {values.startTime || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.reviewVenue}</dt>
                    <dd>
                      {values.venueNameAr || "—"} · {values.city || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.reviewRsvp}</dt>
                    <dd>
                      {values.allowRsvpEdits
                        ? copy.editsAllowed
                        : copy.editsLocked}
                      {" · "}
                      {values.qrEnabled ? copy.qrOn : copy.qrOff}
                    </dd>
                  </div>
                </dl>
              </Card>
              <Banner
                description={copy.reviewReadyDescription}
                icon="circle-check"
                kind="success"
                title={copy.reviewReady}
              />
              {submitError ? (
                <p className="form-error" role="alert">
                  {copy.saveError}
                </p>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>
    </Dialog>
  );
}
