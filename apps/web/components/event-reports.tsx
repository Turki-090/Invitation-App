"use client";

import type {
  CreateExportInput,
  EventReport,
  ExportJob,
} from "@dawah/api-contract";
import {
  Button,
  Card,
  EmptyState,
  Field,
  ProgressBar,
  Select,
  Skeleton,
  StatCard,
  Tag,
  Toast,
} from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import {
  createExportJob,
  downloadExportJob,
  getEventReport,
  listExportJobs,
} from "../lib/api";
import type { getSupabaseClient } from "../lib/supabase";

interface EventReportsProps {
  common: Dictionary["common"];
  copy: Dictionary["reports"];
  eventId: string;
  locale: AppLocale;
  supabase: ReturnType<typeof getSupabaseClient>;
}

type ExportFormat = CreateExportInput["format"];
type ExportPreset = CreateExportInput["preset"];

/** Completed exports expire, so the list is refreshed while work is pending. */
const PENDING_REFRESH_INTERVAL_MILLISECONDS = 5_000;

export function EventReports({
  common,
  copy,
  eventId,
  locale,
  supabase,
}: EventReportsProps) {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<ExportFormat>("XLSX");
  const [preset, setPreset] = useState<ExportPreset>("FULL_GUEST_LIST");
  const [notice, setNotice] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ["events", eventId, "reports"],
    queryFn: () => getEventReport(supabase, eventId),
  });
  const exports = useQuery({
    queryKey: ["events", eventId, "exports"],
    queryFn: () => listExportJobs(supabase, eventId, { page: 1, pageSize: 20 }),
    refetchInterval: (query) =>
      (query.state.data?.items ?? []).some(
        (job) => job.status === "QUEUED" || job.status === "PROCESSING",
      )
        ? PENDING_REFRESH_INTERVAL_MILLISECONDS
        : false,
  });

  const createExport = useMutation({
    mutationFn: () => createExportJob(supabase, eventId, { format, preset }),
    onSuccess: async () => {
      setNotice(copy.exportQueued);
      await queryClient.invalidateQueries({
        queryKey: ["events", eventId, "exports"],
      });
    },
  });

  const download = useMutation({
    mutationFn: async (job: ExportJob) => {
      if (!job.output) throw new Error("The export has no downloadable file.");
      setDownloadingId(job.id);
      const blob = await downloadExportJob(supabase, job.output.downloadUrl);
      return { blob, filename: job.output.filename };
    },
    onSettled: () => setDownloadingId(null),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    onError: async () => {
      // An expired signature is the common case: refresh so the row shows its
      // real state instead of offering a link that can no longer work.
      await queryClient.invalidateQueries({
        queryKey: ["events", eventId, "exports"],
      });
    },
  });

  return (
    <div className="reports-page">
      <header className="workspace-page-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <Button
          onClick={() => {
            void report.refetch();
            void exports.refetch();
          }}
          variant="secondary"
        >
          {copy.refresh}
        </Button>
      </header>

      {report.isLoading ? (
        <ReportLoading label={copy.loading} />
      ) : report.isError || !report.data ? (
        <EmptyState
          action={
            <Button onClick={() => report.refetch()} variant="secondary">
              {common.retry}
            </Button>
          }
          description={copy.loadError}
          icon="circle-alert"
          title={copy.loadError}
        />
      ) : (
        <ReportSummary copy={copy} locale={locale} report={report.data} />
      )}

      <Card subtitle={copy.exportsDescription} title={copy.exportsTitle}>
        <div className="reports-export-form">
          <Field id="export-preset" label={copy.preset}>
            <Select
              onChange={(event) =>
                setPreset(event.currentTarget.value as ExportPreset)
              }
              options={presetOptions(copy)}
              value={preset}
            />
          </Field>
          <Field id="export-format" label={copy.format}>
            <Select
              onChange={(event) =>
                setFormat(event.currentTarget.value as ExportFormat)
              }
              options={[
                { label: copy.xlsx, value: "XLSX" },
                { label: copy.csv, value: "CSV" },
              ]}
              value={format}
            />
          </Field>
          <Button
            disabled={createExport.isPending}
            icon="file-text"
            loading={createExport.isPending}
            onClick={() => createExport.mutate()}
          >
            {createExport.isPending ? copy.creatingExport : copy.createExport}
          </Button>
        </div>
        {createExport.isError ? (
          <Toast
            kind="error"
            onDismiss={() => createExport.reset()}
            dismissLabel={common.close}
            title={copy.exportError}
          />
        ) : null}
      </Card>

      <Card title={copy.historyTitle}>
        {exports.isLoading ? (
          <ReportLoading label={copy.loading} />
        ) : exports.isError || !exports.data ? (
          <EmptyState
            action={
              <Button onClick={() => exports.refetch()} variant="secondary">
                {common.retry}
              </Button>
            }
            description={copy.loadError}
            icon="circle-alert"
            title={copy.loadError}
          />
        ) : exports.data.items.length === 0 ? (
          <EmptyState
            description={copy.noExportsDescription}
            icon="file-text"
            title={copy.noExportsTitle}
          />
        ) : (
          <ul className="reports-export-list">
            {exports.data.items.map((job) => (
              <li className="reports-export" key={job.id}>
                <div className="reports-export__details">
                  <strong>{presetLabel(job.preset, copy)}</strong>
                  <small>
                    {job.format === "CSV" ? copy.csv : copy.xlsx} ·{" "}
                    {formatDateTime(job.requestedAt, locale)}
                  </small>
                  <div className="reports-export__meta">
                    <Tag size="sm" tone={statusTone(job.status)}>
                      {statusLabel(job.status, copy)}
                    </Tag>
                    {job.rowCount === null ? null : (
                      <small>
                        {interpolate(copy.rows, {
                          count: formatNumber(job.rowCount, locale),
                        })}
                      </small>
                    )}
                  </div>
                </div>
                {job.status === "COMPLETED" && job.output ? (
                  <Button
                    disabled={download.isPending}
                    loading={downloadingId === job.id}
                    onClick={() => download.mutate(job)}
                    size="sm"
                    variant="secondary"
                  >
                    {downloadingId === job.id
                      ? copy.downloading
                      : copy.download}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {download.isError ? (
          <Toast
            dismissLabel={common.close}
            kind="error"
            onDismiss={() => download.reset()}
            title={copy.downloadError}
          />
        ) : null}
      </Card>

      {notice ? (
        <Toast
          dismissLabel={common.close}
          onDismiss={() => setNotice("")}
          title={notice}
        />
      ) : null}
    </div>
  );
}

function ReportSummary({
  copy,
  locale,
  report,
}: {
  copy: Dictionary["reports"];
  locale: AppLocale;
  report: EventReport;
}) {
  const rsvpSegments = [
    {
      label: copy.accepted,
      value: report.rsvp.acceptedGroups,
      tone: "accepted" as const,
    },
    {
      label: copy.partiallyAccepted,
      value: report.rsvp.partiallyAcceptedGroups,
      tone: "partial" as const,
    },
    {
      label: copy.declined,
      value: report.rsvp.declinedGroups,
      tone: "declined" as const,
    },
    {
      label: copy.pending,
      value: report.rsvp.pendingGroups,
      tone: "pending" as const,
    },
  ].filter((segment) => segment.value > 0);
  const deliverySegments = [
    { label: copy.queued, value: report.delivery.byStatus.queued },
    { label: copy.sending, value: report.delivery.byStatus.sending },
    { label: copy.sent, value: report.delivery.byStatus.sent },
    { label: copy.delivered, value: report.delivery.byStatus.delivered },
    { label: copy.read, value: report.delivery.byStatus.read },
    { label: copy.responded, value: report.delivery.byStatus.responded },
    { label: copy.failed, value: report.delivery.byStatus.failed },
    { label: copy.cancelled, value: report.delivery.byStatus.cancelled },
    { label: copy.notSent, value: report.delivery.notSentGroups },
  ].filter((segment) => segment.value > 0);

  return (
    <>
      <div className="workspace-stat-grid">
        <StatCard
          context={copy.groupsUnit}
          icon="mail"
          label={copy.invitationGroups}
          locale={locale}
          value={report.invitationGroups.active}
        />
        <StatCard
          context={copy.peopleUnit}
          icon="users"
          label={copy.namedGuests}
          locale={locale}
          value={report.namedGuests}
        />
        <StatCard
          context={copy.peopleUnit}
          label={copy.expectedAttendance}
          locale={locale}
          tone="accepted"
          value={report.expectedAttendance}
        />
        <StatCard
          context={copy.peopleUnit}
          label={copy.checkedInAttendance}
          locale={locale}
          tone="checkedin"
          value={report.checkIn.checkedInAttendees}
        />
      </div>

      <div className="workspace-grid-two">
        <Card title={copy.rsvpTitle}>
          {rsvpSegments.length ? (
            <ProgressBar
              ariaLabel={copy.rsvpTitle}
              locale={locale}
              segments={rsvpSegments}
            />
          ) : (
            <p className="muted">{copy.pending}</p>
          )}
        </Card>
        <Card title={copy.deliveryTitle}>
          {deliverySegments.length ? (
            <dl className="reports-definition-list">
              {deliverySegments.map((segment) => (
                <div key={segment.label}>
                  <dt>{segment.label}</dt>
                  <dd>{formatNumber(segment.value, locale)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted">{copy.notSent}</p>
          )}
        </Card>
      </div>

      <Card title={copy.checkInTitle}>
        <dl className="reports-definition-list">
          <div>
            <dt>{copy.checkedInGroups}</dt>
            <dd>{formatNumber(report.checkIn.checkedInGroups, locale)}</dd>
          </div>
          <div>
            <dt>{copy.remainingAttendance}</dt>
            <dd>{formatNumber(report.checkIn.notArrivedAttendees, locale)}</dd>
          </div>
          <div>
            <dt>{copy.noShowAttendance}</dt>
            <dd>
              {report.checkIn.noShowAttendees === null
                ? copy.noShowPending
                : formatNumber(report.checkIn.noShowAttendees, locale)}
            </dd>
          </div>
        </dl>
      </Card>
    </>
  );
}

function ReportLoading({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="reports-loading">
      <Skeleton height={72} />
      <Skeleton height={72} />
      <Skeleton height={72} />
    </div>
  );
}

function presetOptions(copy: Dictionary["reports"]) {
  return [
    { label: copy.presetFull, value: "FULL_GUEST_LIST" },
    { label: copy.presetConfirmed, value: "CONFIRMED_ATTENDANCE" },
    { label: copy.presetPending, value: "PENDING_RSVP" },
    { label: copy.presetCheckIn, value: "CHECK_IN_LIST" },
    { label: copy.presetFinal, value: "FINAL_ATTENDANCE" },
  ];
}

function presetLabel(
  preset: ExportPreset,
  copy: Dictionary["reports"],
): string {
  return {
    FULL_GUEST_LIST: copy.presetFull,
    CONFIRMED_ATTENDANCE: copy.presetConfirmed,
    PENDING_RSVP: copy.presetPending,
    CHECK_IN_LIST: copy.presetCheckIn,
    FINAL_ATTENDANCE: copy.presetFinal,
  }[preset];
}

function statusLabel(
  status: ExportJob["status"],
  copy: Dictionary["reports"],
): string {
  return {
    QUEUED: copy.statusQueued,
    PROCESSING: copy.statusProcessing,
    COMPLETED: copy.statusCompleted,
    FAILED: copy.statusFailed,
    EXPIRED: copy.statusExpired,
  }[status];
}

function statusTone(
  status: ExportJob["status"],
): "accent" | "neutral" | "outline" {
  if (status === "COMPLETED") return "accent";
  if (status === "QUEUED" || status === "PROCESSING") return "outline";
  return "neutral";
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
