"use client";

import type {
  InvitationTemplate,
  ReminderReadinessRequest,
  ReminderReadinessResponse,
  ReminderRule,
  ReminderRun,
} from "@dawah/api-contract";
import {
  Banner,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  StatCard,
  Switch,
  Tabs,
  Timeline,
  Toast,
} from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import {
  approveInvitationTemplate,
  createInvitationTemplate,
  createPreparationSnapshots,
  createReminderRule,
  getReminderReadiness,
  listInvitationTemplates,
  listReminderRules,
  listReminderRuns,
  sendReminders,
  updateReminderRule,
} from "../lib/api";
import type { getSupabaseClient } from "../lib/supabase";

interface EventRemindersProps {
  common: Dictionary["common"];
  copy: Dictionary["reminders"];
  eventId: string;
  locale: AppLocale;
  supabase: ReturnType<typeof getSupabaseClient>;
}

type ReminderAudience = ReminderReadinessRequest["audience"];
type ReminderExclusionReasonCode =
  ReminderReadinessResponse["excluded"][number]["reasonCodes"][number];
type RuleTrigger = ReminderRule["triggerKind"];

const ACTIVE_RUN_STATUSES = new Set<ReminderRun["status"]>([
  "QUEUED",
  "DISPATCHING",
  "IN_PROGRESS",
]);

export function EventReminders({
  common,
  copy,
  eventId,
  locale,
  supabase,
}: EventRemindersProps) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateLocale, setTemplateLocale] = useState<"ar-SA" | "en">(
    locale === "ar-SA" ? "ar-SA" : "en",
  );
  const [providerTemplateName, setProviderTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState(
    defaultReminderBody(locale === "ar-SA" ? "ar-SA" : "en"),
  );
  const [audience, setAudience] = useState<ReminderAudience>("ALL_PENDING");
  const [cooldownHours, setCooldownHours] = useState(72);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleTrigger, setRuleTrigger] = useState<RuleTrigger>(
    "AFTER_INITIAL_INVITATION",
  );
  const [ruleOffsetDays, setRuleOffsetDays] = useState(3);
  const [ruleMaximum, setRuleMaximum] = useState(1);
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [notice, setNotice] = useState("");
  const sendIdempotencyKey = useRef<string | null>(null);

  const templates = useQuery({
    queryKey: ["events", eventId, "templates"],
    queryFn: () => listInvitationTemplates(supabase, eventId),
  });
  const reminderTemplates = useMemo(
    () =>
      (templates.data ?? []).filter(
        (template) =>
          template.purpose === "REMINDER" && template.status !== "ARCHIVED",
      ),
    [templates.data],
  );
  const selectedTemplate = reminderTemplates.find(
    (template) => template.id === templateId,
  );

  useEffect(() => {
    if (!templateId && reminderTemplates[0]) {
      setTemplateId(reminderTemplates[0].id);
    }
  }, [reminderTemplates, templateId]);

  useEffect(() => {
    sendIdempotencyKey.current = null;
  }, [audience, cooldownHours, templateId]);

  const readiness = useQuery({
    enabled: Boolean(templateId),
    queryKey: [
      "events",
      eventId,
      "reminder-readiness",
      templateId,
      audience,
      cooldownHours,
    ],
    queryFn: () =>
      getReminderReadiness(supabase, eventId, {
        audience,
        cooldownHours,
        templateId,
      }),
    staleTime: 0,
  });
  const rules = useQuery({
    queryKey: ["events", eventId, "reminder-rules"],
    queryFn: () => listReminderRules(supabase, eventId),
  });
  const runs = useQuery({
    queryKey: ["events", eventId, "reminder-runs"],
    queryFn: () => listReminderRuns(supabase, eventId),
    refetchInterval: (query) =>
      query.state.data?.items.some((run) => ACTIVE_RUN_STATUSES.has(run.status))
        ? 4_000
        : false,
  });

  const send = useMutation({
    mutationFn: async () => {
      const review = readiness.data;
      if (!review) throw new Error("Reminder readiness is unavailable");
      sendIdempotencyKey.current ??= createIdempotencyKey();
      return sendReminders(
        supabase,
        eventId,
        {
          audience,
          confirmationToken: review.confirmationToken,
          cooldownHours,
          templateId,
        },
        sendIdempotencyKey.current,
      );
    },
    onSuccess: async (run) => {
      sendIdempotencyKey.current = null;
      setConfirmOpen(false);
      setNotice(
        interpolate(copy.sendQueued, {
          count: formatNumber(run.eligibleCount, locale),
        }),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["events", eventId, "reminder-readiness"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["events", eventId, "reminder-runs"],
        }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });

  const createTemplate = useMutation({
    mutationFn: () =>
      createInvitationTemplate(supabase, eventId, {
        body: templateBody,
        locale: templateLocale,
        name: templateName.trim(),
        providerTemplateName: providerTemplateName.trim(),
        purpose: "REMINDER",
      }),
    onSuccess: async (template) => {
      setTemplateId(template.id);
      setTemplateOpen(false);
      setTemplateName("");
      setProviderTemplateName("");
      setNotice(copy.templateCreated);
      await queryClient.invalidateQueries({
        queryKey: ["events", eventId, "templates"],
      });
    },
  });
  const approveTemplate = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) throw new Error("No reminder template selected");
      return approveInvitationTemplate(
        supabase,
        eventId,
        selectedTemplate.id,
        selectedTemplate.version,
      );
    },
    onSuccess: async () => {
      setNotice(copy.templateApproved);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["events", eventId, "templates"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["events", eventId, "reminder-readiness"],
        }),
      ]);
    },
  });
  const prepareTemplate = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) throw new Error("No reminder template selected");
      return createPreparationSnapshots(supabase, eventId, {
        templateId: selectedTemplate.id,
      });
    },
    onSuccess: async (result) => {
      setNotice(
        interpolate(copy.templatePrepared, {
          count: formatNumber(result.createdCount + result.reusedCount, locale),
        }),
      );
      await queryClient.invalidateQueries({
        queryKey: ["events", eventId, "reminder-readiness"],
      });
    },
  });

  const createRule = useMutation({
    mutationFn: () =>
      createReminderRule(supabase, eventId, {
        cooldownHours,
        enabled: ruleEnabled,
        maximumReminders: ruleMaximum,
        name: ruleName.trim(),
        offsetDays: ruleOffsetDays,
        templateId,
        triggerKind: ruleTrigger,
      }),
    onSuccess: async () => {
      setRuleOpen(false);
      setRuleName("");
      setNotice(copy.ruleSaved);
      await queryClient.invalidateQueries({
        queryKey: ["events", eventId, "reminder-rules"],
      });
    },
  });
  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateReminderRule(supabase, eventId, id, { enabled }),
    onSuccess: async () =>
      queryClient.invalidateQueries({
        queryKey: ["events", eventId, "reminder-rules"],
      }),
  });

  const summary = readiness.data?.summary;
  const exclusionCounts = countExclusionReasons(readiness.data?.excluded);

  return (
    <div className="reminders-page">
      <header className="workspace-page-header reminders-page-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </header>

      <Card title={copy.reviewSend}>
        {templates.isLoading ? (
          <FeatureLoading label={copy.loadingTemplates} />
        ) : templates.isError ? (
          <Banner
            actionLabel={common.retry}
            kind="warning"
            onAction={() => templates.refetch()}
            title={copy.templatesError}
          />
        ) : reminderTemplates.length === 0 ? (
          <div className="reminder-template-empty">
            <EmptyState
              description={copy.noTemplateDescription}
              icon="bell"
              title={copy.noTemplateTitle}
            />
            <Button icon="plus" onClick={() => setTemplateOpen(true)}>
              {copy.newTemplate}
            </Button>
          </div>
        ) : (
          <div className="reminders-review">
            <div className="reminders-controls">
              <Field id="reminder-template" label={copy.templateLabel}>
                <Select
                  id="reminder-template"
                  onChange={(event) => setTemplateId(event.currentTarget.value)}
                  options={reminderTemplates.map((template) => ({
                    label: templateLabel(template, copy),
                    value: template.id,
                  }))}
                  value={templateId}
                />
              </Field>
              <Field id="reminder-cooldown" label={copy.cooldownLabel}>
                <Select
                  id="reminder-cooldown"
                  onChange={(event) =>
                    setCooldownHours(Number(event.currentTarget.value))
                  }
                  options={[
                    { label: copy.cooldown24, value: "24" },
                    { label: copy.cooldown72, value: "72" },
                    { label: copy.cooldown168, value: "168" },
                  ]}
                  value={String(cooldownHours)}
                />
              </Field>
            </div>
            <div className="reminder-template-toolbar">
              <span>
                {selectedTemplate?.status === "APPROVED"
                  ? copy.templateStatusApproved
                  : copy.templateStatusDraft}
              </span>
              <div className="reminder-template-toolbar__actions">
                <Button
                  icon="plus"
                  onClick={() => {
                    createTemplate.reset();
                    setTemplateOpen(true);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {copy.newTemplate}
                </Button>
                {selectedTemplate?.status === "DRAFT" ? (
                  <Button
                    loading={approveTemplate.isPending}
                    onClick={() => approveTemplate.mutate()}
                    size="sm"
                    variant="secondary"
                  >
                    {copy.approveTemplate}
                  </Button>
                ) : null}
                {selectedTemplate?.status === "APPROVED" ? (
                  <Button
                    loading={prepareTemplate.isPending}
                    onClick={() => prepareTemplate.mutate()}
                    size="sm"
                    variant="secondary"
                  >
                    {copy.prepareTemplate}
                  </Button>
                ) : null}
              </div>
            </div>
            {approveTemplate.isError || prepareTemplate.isError ? (
              <p className="form-error" role="alert">
                {approveTemplate.isError
                  ? copy.templateApproveError
                  : copy.templatePrepareError}
              </p>
            ) : null}
            <Tabs
              ariaLabel={copy.audienceLabel}
              items={audienceItems(copy)}
              onChange={(value) => setAudience(value as ReminderAudience)}
              value={audience}
            />

            {readiness.isError ? (
              <Banner
                actionLabel={common.retry}
                kind="warning"
                onAction={() => readiness.refetch()}
                title={copy.readinessError}
              />
            ) : readiness.isLoading || !summary ? (
              <FeatureLoading label={copy.loadingReadiness} />
            ) : (
              <>
                <div className="reminders-stat-grid">
                  <StatCard
                    context={copy.groupsUnit}
                    label={copy.selectedInvitations}
                    locale={locale}
                    value={summary.selectedInvitations}
                  />
                  <StatCard
                    context={copy.groupsUnit}
                    label={copy.eligibleInvitations}
                    locale={locale}
                    tone="accepted"
                    value={summary.eligibleInvitations}
                  />
                  <StatCard
                    context={copy.groupsUnit}
                    label={copy.excludedInvitations}
                    locale={locale}
                    tone="notsent"
                    value={summary.excludedInvitations}
                  />
                  <StatCard
                    context={copy.groupsUnit}
                    label={copy.recentlyReminded}
                    locale={locale}
                    tone="pending"
                    value={summary.recentlyRemindedInvitations}
                  />
                  <StatCard
                    context={copy.creditsUnit}
                    label={copy.estimatedCredits}
                    locale={locale}
                    value={summary.estimatedCreditUnits}
                  />
                </div>
                {summary.recentlyRemindedInvitations > 0 ? (
                  <Banner
                    description={interpolate(copy.cooldownNoticeDescription, {
                      hours: formatNumber(cooldownHours, locale),
                    })}
                    kind="warning"
                    title={interpolate(copy.cooldownNoticeTitle, {
                      count: formatNumber(
                        summary.recentlyRemindedInvitations,
                        locale,
                      ),
                    })}
                  />
                ) : null}
                {exclusionCounts.length ? (
                  <div className="reminders-exclusions">
                    <strong>{copy.exclusionReasonsTitle}</strong>
                    <ul>
                      {exclusionCounts.map(([reason, count]) => (
                        <li key={reason}>
                          <span>{exclusionReasonLabel(reason, copy)}</span>
                          <strong className="num">
                            {formatNumber(count, locale)}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="reminders-safety-note">
                  {copy.neverReminderNote}
                </p>
                <div className="reminders-actions">
                  <Button
                    disabled={summary.eligibleInvitations === 0}
                    icon="bell"
                    onClick={() => {
                      send.reset();
                      setConfirmOpen(true);
                    }}
                  >
                    {copy.reviewSend}
                  </Button>
                  <Button
                    loading={readiness.isFetching}
                    onClick={() => readiness.refetch()}
                    variant="secondary"
                  >
                    {copy.refreshReadiness}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <div className="reminders-secondary-grid">
        <Card
          actions={
            <Button
              disabled={selectedTemplate?.status !== "APPROVED"}
              icon="plus"
              onClick={() => setRuleOpen(true)}
              size="sm"
              variant="secondary"
            >
              {copy.addRule}
            </Button>
          }
          subtitle={copy.rulesDescription}
          title={copy.rulesTitle}
        >
          {rules.isLoading ? (
            <FeatureLoading label={copy.rulesTitle} />
          ) : rules.isError ? (
            <Banner
              actionLabel={common.retry}
              kind="warning"
              onAction={() => rules.refetch()}
              title={copy.ruleError}
            />
          ) : rules.data?.length ? (
            <div className="reminder-rule-list">
              {rules.data.map((rule) => (
                <div className="reminder-rule" key={rule.id}>
                  <Switch
                    checked={rule.enabled}
                    disabled={toggleRule.isPending}
                    label={rule.name}
                    onChange={(event) =>
                      toggleRule.mutate({
                        enabled: event.currentTarget.checked,
                        id: rule.id,
                      })
                    }
                  />
                  <small>{ruleSchedule(rule, copy, locale)}</small>
                </div>
              ))}
              {toggleRule.isError ? (
                <p className="form-error" role="alert">
                  {copy.ruleUpdateError}
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              description={copy.noRulesDescription}
              icon="clock"
              title={copy.noRulesTitle}
            />
          )}
        </Card>

        <Card
          actions={
            <Button
              loading={runs.isFetching}
              onClick={() => runs.refetch()}
              size="sm"
              variant="ghost"
            >
              {copy.refreshRuns}
            </Button>
          }
          subtitle={copy.runsDescription}
          title={copy.runsTitle}
        >
          {runs.isLoading ? (
            <FeatureLoading label={copy.runsTitle} />
          ) : runs.isError ? (
            <Banner
              actionLabel={common.retry}
              kind="warning"
              onAction={() => runs.refetch()}
              title={copy.runsDescription}
            />
          ) : runs.data?.items.length ? (
            <Timeline
              items={runs.data.items.map((run) => ({
                hollow: ACTIVE_RUN_STATUSES.has(run.status),
                icon: ACTIVE_RUN_STATUSES.has(run.status) ? undefined : "bell",
                id: run.id,
                label:
                  run.source === "MANUAL"
                    ? copy.sourceManual
                    : copy.sourceScheduled,
                meta: interpolate(copy.runMeta, {
                  eligible: formatNumber(run.eligibleCount, locale),
                  excluded: formatNumber(run.excludedCount, locale),
                }),
                time: `${runStatusLabel(run.status, copy)} · ${formatDateTime(
                  run.createdAt,
                  locale,
                )}`,
                tone: runTone(run.status),
              }))}
            />
          ) : (
            <EmptyState
              description={copy.noRunsDescription}
              icon="bell"
              title={copy.noRunsTitle}
            />
          )}
        </Card>
      </div>

      <Dialog
        closeLabel={common.close}
        description={copy.confirmDescription}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)} variant="secondary">
              {common.cancel}
            </Button>
            <Button
              disabled={!summary?.eligibleInvitations}
              icon="bell"
              loading={send.isPending}
              onClick={() => send.mutate()}
            >
              {copy.sendAction}
            </Button>
          </>
        }
        onClose={() => setConfirmOpen(false)}
        open={confirmOpen}
        title={interpolate(copy.confirmTitle, {
          count: formatNumber(summary?.eligibleInvitations ?? 0, locale),
        })}
      >
        {summary ? (
          <div className="reminder-confirmation-summary">
            <strong>
              {interpolate(copy.confirmEligible, {
                count: formatNumber(summary.eligibleInvitations, locale),
              })}
            </strong>
            <span>
              {interpolate(copy.confirmExcluded, {
                count: formatNumber(summary.excludedInvitations, locale),
              })}
            </span>
            <span>
              {interpolate(copy.confirmCredits, {
                count: formatNumber(summary.estimatedCreditUnits, locale),
              })}
            </span>
          </div>
        ) : null}
        {send.isError ? (
          <p className="form-error" role="alert">
            {copy.sendError}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        closeLabel={common.close}
        description={copy.templateDialogDescription}
        footer={
          <>
            <Button onClick={() => setTemplateOpen(false)} variant="secondary">
              {common.cancel}
            </Button>
            <Button
              disabled={
                templateName.trim().length === 0 ||
                !/^[a-z0-9_]+$/.test(providerTemplateName.trim()) ||
                templateBody.trim().length === 0
              }
              loading={createTemplate.isPending}
              onClick={() => createTemplate.mutate()}
            >
              {copy.createTemplate}
            </Button>
          </>
        }
        onClose={() => setTemplateOpen(false)}
        open={templateOpen}
        title={copy.templateDialogTitle}
      >
        <div className="reminder-template-form">
          <Field id="reminder-template-name" label={copy.templateName} required>
            <Input
              id="reminder-template-name"
              maxLength={120}
              onChange={(event) => setTemplateName(event.currentTarget.value)}
              placeholder={copy.templateNamePlaceholder}
              value={templateName}
            />
          </Field>
          <Field id="reminder-template-locale" label={copy.templateLocale}>
            <Select
              id="reminder-template-locale"
              onChange={(event) => {
                const nextLocale = event.currentTarget.value as "ar-SA" | "en";
                setTemplateLocale(nextLocale);
                setTemplateBody(defaultReminderBody(nextLocale));
              }}
              options={[
                { label: copy.templateLocaleArabic, value: "ar-SA" },
                { label: copy.templateLocaleEnglish, value: "en" },
              ]}
              value={templateLocale}
            />
          </Field>
          <Field
            hint={copy.providerTemplateHint}
            id="reminder-provider-template-name"
            label={copy.providerTemplateName}
            required
          >
            <Input
              dir="ltr"
              id="reminder-provider-template-name"
              maxLength={255}
              onChange={(event) =>
                setProviderTemplateName(event.currentTarget.value)
              }
              placeholder={copy.providerTemplatePlaceholder}
              value={providerTemplateName}
            />
          </Field>
          <Field id="reminder-template-body" label={copy.templateBody} required>
            <textarea
              className="preparation-textarea"
              dir={templateLocale === "ar-SA" ? "rtl" : "ltr"}
              id="reminder-template-body"
              maxLength={1_500}
              onChange={(event) => setTemplateBody(event.currentTarget.value)}
              value={templateBody}
            />
          </Field>
          <p className="reminder-template-form__sequence">
            {copy.templateSequenceHint}
          </p>
          {createTemplate.isError ? (
            <p className="form-error" role="alert">
              {copy.templateCreateError}
            </p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        closeLabel={common.close}
        description={copy.rulesDescription}
        footer={
          <>
            <Button onClick={() => setRuleOpen(false)} variant="secondary">
              {common.cancel}
            </Button>
            <Button
              disabled={
                ruleName.trim().length < 2 ||
                selectedTemplate?.status !== "APPROVED"
              }
              loading={createRule.isPending}
              onClick={() => createRule.mutate()}
            >
              {copy.saveRule}
            </Button>
          </>
        }
        onClose={() => setRuleOpen(false)}
        open={ruleOpen}
        title={copy.ruleDialogTitle}
      >
        <div className="reminder-rule-form">
          <Field id="reminder-rule-name" label={copy.ruleName} required>
            <Input
              id="reminder-rule-name"
              onChange={(event) => setRuleName(event.currentTarget.value)}
              placeholder={copy.ruleNamePlaceholder}
              value={ruleName}
            />
          </Field>
          <Field id="reminder-rule-trigger" label={copy.ruleTrigger}>
            <Select
              id="reminder-rule-trigger"
              onChange={(event) =>
                setRuleTrigger(event.currentTarget.value as RuleTrigger)
              }
              options={[
                {
                  label: copy.triggerAfterInvitation,
                  value: "AFTER_INITIAL_INVITATION",
                },
                {
                  label: copy.triggerBeforeDeadline,
                  value: "BEFORE_RSVP_DEADLINE",
                },
              ]}
              value={ruleTrigger}
            />
          </Field>
          <div className="reminder-rule-form__numbers">
            <Field id="reminder-rule-offset" label={copy.offsetDays}>
              <Input
                id="reminder-rule-offset"
                max={30}
                min={1}
                onChange={(event) =>
                  setRuleOffsetDays(Number(event.currentTarget.value))
                }
                type="number"
                value={ruleOffsetDays}
              />
            </Field>
            <Field id="reminder-rule-maximum" label={copy.maximumReminders}>
              <Input
                id="reminder-rule-maximum"
                max={5}
                min={1}
                onChange={(event) =>
                  setRuleMaximum(Number(event.currentTarget.value))
                }
                type="number"
                value={ruleMaximum}
              />
            </Field>
          </div>
          <Switch
            checked={ruleEnabled}
            label={copy.ruleEnabled}
            onChange={(event) => setRuleEnabled(event.currentTarget.checked)}
          />
          {createRule.isError ? (
            <p className="form-error" role="alert">
              {copy.ruleError}
            </p>
          ) : null}
        </div>
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

function FeatureLoading({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="feature-loading"
      role="status"
    >
      <span className="dawah-sr-only">{label}</span>
      <span className="skeleton" />
      <span className="skeleton" />
    </div>
  );
}

function audienceItems(copy: Dictionary["reminders"]) {
  return [
    { id: "ALL_PENDING", label: copy.audienceAllPending },
    { id: "SENT_UNREAD", label: copy.audienceSentUnread },
    { id: "READ_NO_RESPONSE", label: copy.audienceReadNoResponse },
    {
      id: "APPROACHING_DEADLINE",
      label: copy.audienceApproachingDeadline,
    },
  ];
}

function templateLabel(
  template: InvitationTemplate,
  copy: Dictionary["reminders"],
): string {
  const status =
    template.status === "APPROVED"
      ? copy.templateStatusApproved
      : copy.templateStatusDraft;
  return `${template.name} · ${template.locale} · ${status}`;
}

function defaultReminderBody(locale: "ar-SA" | "en"): string {
  return locale === "ar-SA"
    ? "نود تذكيركم بدعوتكم إلى {{event_name}} بتاريخ {{event_date}} الساعة {{event_time}} في {{venue}}."
    : "A gentle reminder of your invitation to {{event_name}} on {{event_date}} at {{event_time}} in {{venue}}.";
}

function countExclusionReasons(
  excluded:
    | ReadonlyArray<{ reasonCodes: readonly ReminderExclusionReasonCode[] }>
    | undefined,
): Array<[ReminderExclusionReasonCode, number]> {
  const counts = new Map<ReminderExclusionReasonCode, number>();
  for (const item of excluded ?? []) {
    for (const reason of item.reasonCodes) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()];
}

function exclusionReasonLabel(
  reason: ReminderExclusionReasonCode,
  copy: Dictionary["reminders"],
): string {
  return {
    AUDIENCE_MISMATCH: copy.reasonAudienceMismatch,
    COOLDOWN_ACTIVE: copy.reasonCooldownActive,
    CURRENT_SNAPSHOT_REQUIRED: copy.reasonCurrentSnapshotRequired,
    EVENT_NOT_REMINDABLE: copy.reasonEventNotRemindable,
    INITIAL_DELIVERY_FAILED: copy.reasonInitialDeliveryFailed,
    INITIAL_INVITATION_NOT_SENT: copy.reasonInitialInvitationNotSent,
    INVITATION_CANCELLED: copy.reasonInvitationCancelled,
    RSVP_NOT_PENDING: copy.reasonRsvpNotPending,
    RULE_LIMIT_REACHED: copy.reasonRuleLimitReached,
    RULE_NOT_DUE: copy.reasonRuleNotDue,
    TEMPLATE_NOT_APPROVED: copy.reasonTemplateNotApproved,
  }[reason];
}

function ruleSchedule(
  rule: ReminderRule,
  copy: Dictionary["reminders"],
  locale: AppLocale,
): string {
  return interpolate(
    rule.triggerKind === "AFTER_INITIAL_INVITATION"
      ? copy.ruleScheduleAfter
      : copy.ruleScheduleBefore,
    { count: formatNumber(rule.offsetDays, locale) },
  );
}

function runStatusLabel(
  status: ReminderRun["status"],
  copy: Dictionary["reminders"],
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

function runTone(
  status: ReminderRun["status"],
): "accepted" | "declined" | "pending" | "partial" | "notsent" {
  if (status === "COMPLETED") return "accepted";
  if (status === "FAILED") return "declined";
  if (status === "PARTIALLY_FAILED") return "partial";
  if (ACTIVE_RUN_STATUSES.has(status)) return "pending";
  return "notsent";
}

function createIdempotencyKey(): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `reminder-send:${suffix}`;
}

function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(
    locale === "ar-SA" ? "ar-SA-u-nu-arab" : "en-US",
  ).format(value);
}

function formatDateTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}
