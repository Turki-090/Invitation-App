"use client";

import type {
  InvitationTemplate,
  MessageSummary,
  ResendReadinessResponse,
  SendBatch,
} from "@dawah/api-contract";
import {
  Banner,
  Button,
  Card,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  ProgressBar,
  Select,
  StatCard,
  StatusPill,
  Table,
  Toast,
} from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import {
  createSendBatch,
  getResendReadiness,
  getSendBatch,
  getSendReadiness,
  listInvitationTemplates,
  listSendBatches,
  resendMessage,
} from "../lib/api";
import type { getSupabaseClient } from "../lib/supabase";

interface EventSendingProps {
  common: Dictionary["common"];
  copy: Dictionary["sending"];
  eventId: string;
  locale: AppLocale;
  supabase: ReturnType<typeof getSupabaseClient>;
}

const ACTIVE_BATCH_STATUSES = new Set<SendBatch["status"]>([
  "QUEUED",
  "DISPATCHING",
  "IN_PROGRESS",
]);
const FAILURE_PAGE_SIZE = 100;

export function EventSending({
  common,
  copy,
  eventId,
  locale,
  supabase,
}: EventSendingProps) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [failurePage, setFailurePage] = useState(1);
  const [sendConfirmationOpen, setSendConfirmationOpen] = useState(false);
  const [selectedFailure, setSelectedFailure] = useState<MessageSummary | null>(
    null,
  );
  const [resendReview, setResendReview] =
    useState<ResendReadinessResponse | null>(null);
  const [resendConfirmationOpen, setResendConfirmationOpen] = useState(false);
  const [successNotice, setSuccessNotice] = useState<"send" | "resend" | null>(
    null,
  );
  const sendIdempotencyKey = useRef<string | null>(null);
  const resendIdempotencyKey = useRef<string | null>(null);
  const selectedFailureId = useRef<string | null>(null);

  const templates = useQuery({
    queryKey: ["events", eventId, "templates"],
    queryFn: () => listInvitationTemplates(supabase, eventId),
  });
  const approvedTemplates = useMemo(
    () =>
      (templates.data ?? []).filter(
        (template) => template.status === "APPROVED",
      ),
    [templates.data],
  );

  useEffect(() => {
    if (!templateId && approvedTemplates[0]) {
      setTemplateId(approvedTemplates[0].id);
    }
  }, [approvedTemplates, templateId]);

  const readiness = useQuery({
    enabled: Boolean(templateId),
    queryKey: ["events", eventId, "send-readiness", templateId],
    queryFn: () => getSendReadiness(supabase, eventId, { templateId }),
    staleTime: 0,
  });
  const batches = useQuery({
    queryKey: ["events", eventId, "send-batches"],
    queryFn: () => listSendBatches(supabase, eventId),
    refetchInterval: (query) =>
      query.state.data?.items.some((batch) =>
        ACTIVE_BATCH_STATUSES.has(batch.status),
      )
        ? 4_000
        : false,
  });

  useEffect(() => {
    if (!selectedBatchId && batches.data?.items[0]) {
      setSelectedBatchId(batches.data.items[0].id);
    }
  }, [batches.data, selectedBatchId]);

  const batchDetail = useQuery({
    enabled: Boolean(selectedBatchId),
    queryKey: [
      "events",
      eventId,
      "send-batches",
      selectedBatchId,
      "failed",
      failurePage,
    ],
    queryFn: () =>
      getSendBatch(supabase, eventId, selectedBatchId, {
        page: failurePage,
        pageSize: FAILURE_PAGE_SIZE,
        status: "FAILED",
      }),
    refetchInterval: (query) =>
      query.state.data &&
      ACTIVE_BATCH_STATUSES.has(query.state.data.batch.status)
        ? 4_000
        : false,
  });

  useEffect(() => {
    const totalPages = batchDetail.data?.pagination.totalPages ?? 0;
    if (totalPages > 0 && failurePage > totalPages) {
      setFailurePage(totalPages);
    }
  }, [batchDetail.data?.pagination.totalPages, failurePage]);

  const send = useMutation({
    mutationFn: async () => {
      if (!readiness.data) throw new Error("Send readiness is unavailable");
      sendIdempotencyKey.current ??= createIdempotencyKey("initial-send");
      return createSendBatch(
        supabase,
        eventId,
        {
          templateId,
          confirmationToken: readiness.data.confirmationToken,
        },
        sendIdempotencyKey.current,
      );
    },
    onSuccess: async (batch) => {
      sendIdempotencyKey.current = null;
      setSendConfirmationOpen(false);
      setSelectedBatchId(batch.id);
      setFailurePage(1);
      setSuccessNotice("send");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["events", eventId, "send-batches"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["events", eventId, "send-readiness"],
        }),
      ]);
    },
  });

  const reviewResend = useMutation({
    mutationFn: (messageId: string) =>
      getResendReadiness(supabase, eventId, messageId),
    onSuccess: (review, messageId) => {
      if (selectedFailureId.current !== messageId) return;
      setResendReview(review);
      resendIdempotencyKey.current = null;
      setResendConfirmationOpen(true);
    },
  });
  const resend = useMutation({
    mutationFn: async () => {
      if (!resendReview?.confirmationToken) {
        throw new Error("Resend confirmation is unavailable");
      }
      resendIdempotencyKey.current ??= createIdempotencyKey(
        `resend-${resendReview.messageId}`,
      );
      return resendMessage(
        supabase,
        eventId,
        resendReview.messageId,
        { confirmationToken: resendReview.confirmationToken },
        resendIdempotencyKey.current,
      );
    },
    onSuccess: async (batch) => {
      resendIdempotencyKey.current = null;
      setResendConfirmationOpen(false);
      setSelectedFailure(null);
      selectedFailureId.current = null;
      setResendReview(null);
      setSelectedBatchId(batch.id);
      setFailurePage(1);
      setSuccessNotice("resend");
      await queryClient.invalidateQueries({
        queryKey: ["events", eventId, "send-batches"],
      });
    },
  });

  const selectedTemplate = approvedTemplates.find(
    (template) => template.id === templateId,
  );
  const summary = readiness.data?.summary;
  const selectedBatch = batchDetail.data?.batch;
  const failures = batchDetail.data?.messages ?? [];

  return (
    <div className="sending-page">
      <header className="workspace-page-header sending-page-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </header>

      <Card subtitle={copy.composeDescription} title={copy.composeTitle}>
        {templates.isLoading ? (
          <SendingLoading label={copy.loadingTemplates} />
        ) : templates.isError ? (
          <Banner
            actionLabel={common.retry}
            kind="warning"
            onAction={() => templates.refetch()}
            title={copy.templatesError}
          />
        ) : approvedTemplates.length === 0 ? (
          <EmptyState
            description={copy.noApprovedTemplateDescription}
            icon="file-text"
            title={copy.noApprovedTemplateTitle}
          />
        ) : (
          <div className="sending-compose">
            <div className="sending-template-row">
              <Field id="sending-template" label={copy.templateLabel}>
                <Select
                  id="sending-template"
                  onChange={(event) => {
                    setTemplateId(event.currentTarget.value);
                    sendIdempotencyKey.current = null;
                    send.reset();
                  }}
                  options={approvedTemplates.map((template) => ({
                    label: templateOptionLabel(template, copy),
                    value: template.id,
                  }))}
                  value={templateId}
                />
              </Field>
              <Button
                loading={readiness.isFetching}
                onClick={() => readiness.refetch()}
                variant="secondary"
              >
                {copy.refreshReadiness}
              </Button>
            </div>

            {selectedTemplate && !selectedTemplate.providerTemplateName ? (
              <Banner kind="warning" title={copy.providerTemplateMissing} />
            ) : null}
            {readiness.isError ? (
              <Banner
                actionLabel={common.retry}
                kind="warning"
                onAction={() => readiness.refetch()}
                title={copy.readinessError}
              />
            ) : readiness.isLoading || !summary ? (
              <SendingLoading label={copy.loadingReadiness} />
            ) : (
              <>
                <div className="sending-stat-grid">
                  <StatCard
                    context={copy.invitationGroupsUnit}
                    label={copy.selectedInvitations}
                    locale={locale === "ar-SA" ? "ar" : "en"}
                    value={summary.selectedInvitations}
                  />
                  <StatCard
                    context={copy.invitationGroupsUnit}
                    label={copy.readyInvitations}
                    locale={locale === "ar-SA" ? "ar" : "en"}
                    value={summary.readyInvitations}
                  />
                  <StatCard
                    context={copy.invitationGroupsUnit}
                    label={copy.alreadySentInvitations}
                    locale={locale === "ar-SA" ? "ar" : "en"}
                    value={summary.alreadySentInvitations}
                  />
                  <StatCard
                    context={copy.invitationGroupsUnit}
                    label={copy.blockedInvitations}
                    locale={locale === "ar-SA" ? "ar" : "en"}
                    value={summary.blockedInvitations}
                  />
                  <StatCard
                    context={copy.creditsUnit}
                    label={copy.estimatedCredits}
                    locale={locale === "ar-SA" ? "ar" : "en"}
                    value={summary.estimatedCreditUnits}
                  />
                </div>
                {summary.blockedInvitations > 0 ? (
                  <p className="sending-help">
                    {interpolate(copy.blockedExcluded, {
                      count: formatNumber(summary.blockedInvitations, locale),
                    })}
                  </p>
                ) : null}
                <div className="sending-actions">
                  <Button
                    disabled={summary.readyInvitations === 0}
                    icon="send"
                    onClick={() => {
                      send.reset();
                      setSendConfirmationOpen(true);
                    }}
                  >
                    {copy.reviewAndSend}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <Card
        actions={
          <Button
            loading={batches.isFetching}
            onClick={() => batches.refetch()}
            variant="ghost"
          >
            {copy.refreshBatches}
          </Button>
        }
        subtitle={copy.activityDescription}
        title={copy.activityTitle}
      >
        {batches.isLoading ? (
          <SendingLoading label={copy.loadingBatches} />
        ) : batches.isError ? (
          <Banner
            actionLabel={common.retry}
            kind="warning"
            onAction={() => batches.refetch()}
            title={copy.batchesError}
          />
        ) : !batches.data?.items.length ? (
          <EmptyState
            description={copy.noBatchesDescription}
            icon="send"
            title={copy.noBatchesTitle}
          />
        ) : (
          <div className="sending-activity-grid">
            <div
              className="sending-batch-list"
              aria-label={copy.batchListLabel}
            >
              {batches.data.items.map((batch) => (
                <button
                  aria-current={
                    selectedBatchId === batch.id ? "true" : undefined
                  }
                  className="sending-batch-item"
                  key={batch.id}
                  onClick={() => {
                    setSelectedBatchId(batch.id);
                    setFailurePage(1);
                  }}
                  type="button"
                >
                  <span>
                    <strong>{formatDateTime(batch.createdAt, locale)}</strong>
                    <small>
                      {interpolate(copy.batchMessageCount, {
                        count: formatNumber(batch.totalMessages, locale),
                      })}
                    </small>
                  </span>
                  <StatusPill
                    kind="delivery"
                    label={batchStatusLabel(batch.status, copy)}
                    size="sm"
                    status={batchStatusTone(batch.status)}
                  />
                </button>
              ))}
            </div>

            <div className="sending-batch-detail">
              {batchDetail.isLoading ? (
                <SendingLoading label={copy.loadingBatchDetail} />
              ) : batchDetail.isError || !selectedBatch ? (
                <Banner
                  actionLabel={common.retry}
                  kind="warning"
                  onAction={() => batchDetail.refetch()}
                  title={copy.batchDetailError}
                />
              ) : (
                <>
                  <div className="sending-batch-heading">
                    <div>
                      <h3>{copy.progressTitle}</h3>
                      <p>
                        {interpolate(copy.creditSummary, {
                          count: formatNumber(
                            selectedBatch.estimatedCreditUnits,
                            locale,
                          ),
                        })}
                      </p>
                    </div>
                    <StatusPill
                      kind="delivery"
                      label={batchStatusLabel(selectedBatch.status, copy)}
                      status={batchStatusTone(selectedBatch.status)}
                    />
                  </div>
                  <p
                    aria-atomic="true"
                    aria-live="polite"
                    className="dawah-sr-only"
                    role="status"
                  >
                    {interpolate(copy.progressAnnouncement, {
                      completed: formatNumber(
                        selectedBatch.progress.completed,
                        locale,
                      ),
                      status: batchStatusLabel(selectedBatch.status, copy),
                      total: formatNumber(selectedBatch.totalMessages, locale),
                    })}
                  </p>
                  <ProgressBar
                    ariaLabel={copy.progressLabel}
                    locale={locale === "ar-SA" ? "ar" : "en"}
                    segments={progressSegments(selectedBatch, copy)}
                    total={selectedBatch.totalMessages}
                  />
                  <div className="sending-progress-counts">
                    <span>
                      {copy.queued}:{" "}
                      <strong>
                        {formatNumber(
                          selectedBatch.progress.queued +
                            selectedBatch.progress.sending,
                          locale,
                        )}
                      </strong>
                    </span>
                    <span>
                      {copy.sent}:{" "}
                      <strong>
                        {formatNumber(selectedBatch.progress.sent, locale)}
                      </strong>
                    </span>
                    <span>
                      {copy.delivered}:{" "}
                      <strong>
                        {formatNumber(selectedBatch.progress.delivered, locale)}
                      </strong>
                    </span>
                    <span>
                      {copy.read}:{" "}
                      <strong>
                        {formatNumber(
                          selectedBatch.progress.read +
                            selectedBatch.progress.responded,
                          locale,
                        )}
                      </strong>
                    </span>
                    <span>
                      {copy.failed}:{" "}
                      <strong>
                        {formatNumber(selectedBatch.progress.failed, locale)}
                      </strong>
                    </span>
                    <span>
                      {copy.cancelled}:{" "}
                      <strong>
                        {formatNumber(selectedBatch.progress.cancelled, locale)}
                      </strong>
                    </span>
                  </div>

                  <div className="sending-failures-heading">
                    <div>
                      <h3>{copy.failuresTitle}</h3>
                      <p>{copy.failuresDescription}</p>
                    </div>
                  </div>
                  <Table
                    columns={failureColumns(copy, locale)}
                    emptyState={
                      <p className="sending-empty-row">{copy.noFailures}</p>
                    }
                    getRowKey={(message) => message.id}
                    onRowClick={(message) => {
                      setSelectedFailure(message);
                      selectedFailureId.current = message.id;
                      setResendReview(null);
                      reviewResend.reset();
                      resend.reset();
                    }}
                    renderMobile={(message) => (
                      <FailureMobile message={message} copy={copy} />
                    )}
                    rowActionHeaderLabel={copy.failureActionColumn}
                    rowLabel={(message) =>
                      interpolate(copy.openFailure, {
                        name: message.invitationDisplayName,
                      })
                    }
                    rows={failures}
                  />
                  {(batchDetail.data?.pagination.totalItems ?? 0) >
                  failures.length ? (
                    <p className="sending-help">
                      {interpolate(copy.failurePageNote, {
                        shown: formatNumber(failures.length, locale),
                        total: formatNumber(
                          batchDetail.data?.pagination.totalItems ?? 0,
                          locale,
                        ),
                      })}
                    </p>
                  ) : null}
                  {(batchDetail.data?.pagination.totalPages ?? 0) > 1 ? (
                    <div className="sending-pagination">
                      <Button
                        disabled={failurePage <= 1}
                        onClick={() => setFailurePage((page) => page - 1)}
                        size="sm"
                        variant="secondary"
                      >
                        {copy.failurePreviousPage}
                      </Button>
                      <span className="num">
                        {interpolate(copy.failurePageSummary, {
                          page: formatNumber(failurePage, locale),
                          total: formatNumber(
                            batchDetail.data?.pagination.totalPages ?? 0,
                            locale,
                          ),
                        })}
                      </span>
                      <Button
                        disabled={
                          failurePage >=
                          (batchDetail.data?.pagination.totalPages ?? 0)
                        }
                        onClick={() => setFailurePage((page) => page + 1)}
                        size="sm"
                        variant="secondary"
                      >
                        {copy.failureNextPage}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      <Dialog
        closeLabel={common.close}
        description={copy.confirmSendDescription}
        footer={
          <>
            <Button
              onClick={() => setSendConfirmationOpen(false)}
              variant="secondary"
            >
              {common.cancel}
            </Button>
            <Button
              disabled={!summary?.readyInvitations}
              icon="send"
              loading={send.isPending}
              onClick={() => send.mutate()}
            >
              {copy.confirmSend}
            </Button>
          </>
        }
        onClose={() => setSendConfirmationOpen(false)}
        open={sendConfirmationOpen}
        title={copy.confirmSendTitle}
      >
        {summary ? (
          <div className="sending-confirmation-summary">
            <strong>
              {interpolate(copy.confirmReadyCount, {
                count: formatNumber(summary.readyInvitations, locale),
              })}
            </strong>
            <p>
              {interpolate(copy.confirmCreditCount, {
                count: formatNumber(summary.estimatedCreditUnits, locale),
              })}
            </p>
            {summary.blockedInvitations > 0 ? (
              <p>
                {interpolate(copy.confirmBlockedCount, {
                  count: formatNumber(summary.blockedInvitations, locale),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
        {send.isError ? (
          <p className="form-error" role="alert">
            {copy.sendError}
          </p>
        ) : null}
      </Dialog>

      <Drawer
        closeLabel={common.close}
        description={selectedFailure?.maskedPhone}
        footer={
          selectedFailure?.canResend ? (
            <Button
              loading={reviewResend.isPending}
              onClick={() => reviewResend.mutate(selectedFailure.id)}
            >
              {copy.reviewResend}
            </Button>
          ) : undefined
        }
        onClose={() => {
          selectedFailureId.current = null;
          setSelectedFailure(null);
          setResendReview(null);
          reviewResend.reset();
        }}
        open={Boolean(selectedFailure)}
        title={
          selectedFailure?.invitationDisplayName ?? copy.failureDetailTitle
        }
      >
        {selectedFailure ? (
          <dl className="sending-failure-details">
            <div>
              <dt>{copy.failureReason}</dt>
              <dd>{localizedFailureReason(selectedFailure, copy)}</dd>
            </div>
            <div>
              <dt>{copy.failureCode}</dt>
              <dd className="num">{selectedFailure.failureCode ?? "—"}</dd>
            </div>
            <div>
              <dt>{copy.failureClass}</dt>
              <dd>
                {selectedFailure.failureClass
                  ? failureClassLabel(selectedFailure.failureClass, copy)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{copy.attempts}</dt>
              <dd>{formatNumber(selectedFailure.attemptCount, locale)}</dd>
            </div>
          </dl>
        ) : null}
        {reviewResend.isError ? (
          <p className="form-error" role="alert">
            {copy.resendReadinessError}
          </p>
        ) : null}
      </Drawer>

      <Dialog
        closeLabel={common.close}
        description={copy.confirmResendDescription}
        footer={
          <>
            <Button
              onClick={() => setResendConfirmationOpen(false)}
              variant="secondary"
            >
              {common.cancel}
            </Button>
            <Button
              disabled={!resendReview?.eligible}
              loading={resend.isPending}
              onClick={() => resend.mutate()}
            >
              {copy.confirmResend}
            </Button>
          </>
        }
        onClose={() => setResendConfirmationOpen(false)}
        open={resendConfirmationOpen}
        title={copy.confirmResendTitle}
      >
        {resendReview?.eligible ? (
          <p>{copy.resendCreditNotice}</p>
        ) : (
          <p>{localizedResendReason(resendReview, copy)}</p>
        )}
        {resend.isError ? (
          <p className="form-error" role="alert">
            {copy.resendError}
          </p>
        ) : null}
      </Dialog>

      {successNotice ? (
        <div className="app-toast-region">
          <Toast
            dismissLabel={common.close}
            onDismiss={() => setSuccessNotice(null)}
            title={
              successNotice === "send" ? copy.batchQueued : copy.resendQueued
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function SendingLoading({ label }: { label: string }) {
  return (
    <div
      aria-atomic="true"
      aria-busy="true"
      aria-live="polite"
      className="sending-loading"
      role="status"
    >
      <span className="dawah-sr-only">{label}</span>
      <div aria-hidden="true" className="skeleton sending-loading__line" />
      <div aria-hidden="true" className="skeleton sending-loading__panel" />
    </div>
  );
}

function FailureMobile({
  message,
  copy,
}: {
  message: MessageSummary;
  copy: Dictionary["sending"];
}) {
  return (
    <div className="sending-failure-mobile">
      <strong>{message.invitationDisplayName}</strong>
      <span className="num" dir="ltr">
        {message.maskedPhone}
      </span>
      <small>{localizedFailureReason(message, copy)}</small>
    </div>
  );
}

function failureColumns(copy: Dictionary["sending"], locale: AppLocale) {
  return [
    {
      key: "recipient",
      header: copy.recipientColumn,
      render: (message: MessageSummary) => message.invitationDisplayName,
      wrap: true,
    },
    {
      key: "phone",
      header: copy.phoneColumn,
      render: (message: MessageSummary) => (
        <span className="num" dir="ltr">
          {message.maskedPhone}
        </span>
      ),
    },
    {
      key: "reason",
      header: copy.failureReason,
      render: (message: MessageSummary) =>
        localizedFailureReason(message, copy),
      wrap: true,
    },
    {
      key: "attempts",
      header: copy.attempts,
      align: "center" as const,
      render: (message: MessageSummary) =>
        formatNumber(message.attemptCount, locale),
    },
  ];
}

function progressSegments(batch: SendBatch, copy: Dictionary["sending"]) {
  return [
    {
      label: copy.queued,
      value: batch.progress.queued + batch.progress.sending,
      tone: "pending" as const,
    },
    {
      label: copy.sent,
      value: batch.progress.sent,
      tone: "notsent" as const,
    },
    {
      label: copy.delivered,
      value: batch.progress.delivered,
      tone: "partial" as const,
    },
    {
      label: copy.read,
      value: batch.progress.read + batch.progress.responded,
      tone: "accepted" as const,
    },
    {
      label: copy.failed,
      value: batch.progress.failed,
      tone: "declined" as const,
    },
    {
      label: copy.cancelled,
      value: batch.progress.cancelled,
      tone: "notsent" as const,
    },
  ];
}

function templateOptionLabel(
  template: InvitationTemplate,
  copy: Dictionary["sending"],
) {
  const localeLabel = template.locale === "ar-SA" ? copy.arabic : copy.english;
  return `${template.name} · ${localeLabel}`;
}

function batchStatusTone(status: SendBatch["status"]): string {
  if (status === "COMPLETED") return "delivered";
  if (status === "FAILED" || status === "PARTIALLY_FAILED") return "failed";
  if (status === "CANCELLED") return "cancelled";
  return "queued";
}

function batchStatusLabel(
  status: SendBatch["status"],
  copy: Dictionary["sending"],
): string {
  return {
    CANCELLED: copy.statusCancelled,
    COMPLETED: copy.statusCompleted,
    DISPATCHING: copy.statusDispatching,
    FAILED: copy.statusFailed,
    IN_PROGRESS: copy.statusInProgress,
    PARTIALLY_FAILED: copy.statusPartiallyFailed,
    QUEUED: copy.statusQueued,
  }[status];
}

function failureClassLabel(
  failureClass: NonNullable<MessageSummary["failureClass"]>,
  copy: Dictionary["sending"],
): string {
  return {
    AMBIGUOUS: copy.failureAmbiguous,
    PERMANENT: copy.failurePermanent,
    TRANSIENT: copy.failureTransient,
  }[failureClass];
}

function localizedFailureReason(
  message: MessageSummary,
  copy: Dictionary["sending"],
): string {
  const byCode: Readonly<Record<string, string>> = {
    "131026": copy.failureReasonRecipientUnavailable,
    DISPATCH_RETRY_EXHAUSTED: copy.failureReasonDispatchExhausted,
    JOB_RETRY_EXHAUSTED: copy.failureReasonJobExhausted,
    RETRY_LIMIT_REACHED: copy.failureReasonRetryLimit,
    WORKER_INTERRUPTED: copy.failureReasonWorkerInterrupted,
  };
  const knownReason = message.failureCode
    ? byCode[message.failureCode]
    : undefined;
  if (knownReason) return knownReason;
  if (message.failureClass === "AMBIGUOUS") {
    return copy.failureReasonAmbiguous;
  }
  if (message.failureClass === "PERMANENT") {
    return copy.failureReasonPermanent;
  }
  if (message.failureClass === "TRANSIENT") {
    return copy.failureReasonTransient;
  }
  return copy.unknownFailure;
}

function localizedResendReason(
  review: ResendReadinessResponse | null,
  copy: Dictionary["sending"],
): string {
  if (!review?.reasonCode) return copy.resendUnavailable;
  return {
    ALREADY_RESENT: copy.resendAlreadySent,
    AMBIGUOUS_OUTCOME: copy.resendAmbiguousOutcome,
    NOT_FAILED: copy.resendNotFailed,
    SNAPSHOT_STALE: copy.resendSnapshotStale,
    TEMPLATE_NOT_APPROVED: copy.resendTemplateNotApproved,
  }[review.reasonCode];
}

function createIdempotencyKey(scope: string): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scope}:${suffix}`;
}

function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(
    locale === "ar-SA" ? "ar-SA-u-nu-arab" : "en",
  ).format(value);
}

function formatDateTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function interpolate(
  value: string,
  replacements: Record<string, string>,
): string {
  return Object.entries(replacements).reduce(
    (result, [key, replacement]) => result.replace(`{${key}}`, replacement),
    value,
  );
}
