"use client";

import {
  IMPORT_MAPPING_FIELDS,
  IMPORT_ROW_STATUSES,
  MESSAGE_VARIABLES,
  type ImportColumnMappingInput,
  type ImportJobDetailResponse,
  type ImportRow,
  type InvitationPreviewRequest,
  type InvitationTemplate,
  type UpdateImportRowInput,
} from "@dawah/api-contract";
import {
  Banner,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Icon,
  Input,
  Select,
  StatCard,
  Table,
  Tabs,
  Tag,
  Toast,
} from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import {
  approveInvitationTemplate,
  archiveInvitationTemplate,
  cancelImportJob,
  confirmImportJob,
  createImportJob,
  createInvitationTemplate,
  createPreparationSnapshots,
  getImportJob,
  getImportLimits,
  getPreparationReadiness,
  listImportJobs,
  listInvitationAssets,
  listInvitationTemplates,
  previewInvitation,
  updateImportMapping,
  updateImportRow,
  updateInvitationTemplate,
  uploadInvitationAsset,
} from "../lib/api";
import { getSupabaseClient } from "../lib/supabase";

type PreparationTab = "message" | "import";
type InvitationType = InvitationPreviewRequest["invitationType"];
type MappingField = (typeof IMPORT_MAPPING_FIELDS)[number];
type ImportDetail = ImportJobDetailResponse;

interface EventPreparationProps {
  common: Dictionary["common"];
  copy: Dictionary["preparation"];
  eventId: string;
  locale: AppLocale;
  supabase: ReturnType<typeof getSupabaseClient>;
}

interface TemplateDraft {
  name: string;
  locale: "ar-SA" | "en";
  providerTemplateName: string;
  body: string;
  extraMessage: string;
  assetId: string;
}

const emptyMapping = Object.fromEntries(
  IMPORT_MAPPING_FIELDS.map((field) => [field, ""]),
) as Record<MappingField, string>;

export function EventPreparation({
  common,
  copy,
  eventId,
  locale,
  supabase,
}: EventPreparationProps) {
  const [tab, setTab] = useState<PreparationTab>("message");

  return (
    <div className="preparation-page">
      <header className="workspace-page-header preparation-page-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </header>
      <Tabs
        ariaLabel={copy.tabsLabel}
        items={[
          { id: "message", label: copy.messageTab },
          { id: "import", label: copy.importTab },
        ]}
        onChange={(next) => setTab(next as PreparationTab)}
        value={tab}
      />
      {tab === "message" ? (
        <MessagePreparation
          common={common}
          copy={copy}
          eventId={eventId}
          locale={locale}
          supabase={supabase}
        />
      ) : (
        <ImportPreparation
          common={common}
          copy={copy}
          eventId={eventId}
          locale={locale}
          supabase={supabase}
        />
      )}
    </div>
  );
}

function MessagePreparation({
  common,
  copy,
  eventId,
  locale,
  supabase,
}: EventPreparationProps) {
  const queryClient = useQueryClient();
  const templates = useQuery({
    queryKey: ["events", eventId, "templates"],
    queryFn: () => listInvitationTemplates(supabase, eventId),
  });
  const assets = useQuery({
    queryKey: ["events", eventId, "invitation-assets"],
    queryFn: () => listInvitationAssets(supabase, eventId),
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [creating, setCreating] = useState(false);
  const [invitationType, setInvitationType] = useState<InvitationType>(
    "PRIMARY_WITH_COMPANIONS",
  );
  const [draft, setDraft] = useState<TemplateDraft>(() =>
    blankTemplate(copy, locale),
  );
  const [toast, setToast] = useState("");
  const selectedTemplate = templates.data?.find(
    (template) => template.id === selectedTemplateId,
  );

  useEffect(() => {
    if (!selectedTemplateId && templates.data?.length) {
      setSelectedTemplateId(
        templates.data.find((template) => template.status !== "ARCHIVED")?.id ??
          templates.data[0]?.id ??
          "",
      );
    }
  }, [selectedTemplateId, templates.data]);

  useEffect(() => {
    if (!selectedTemplate || creating) return;
    setDraft(templateToDraft(selectedTemplate));
  }, [creating, selectedTemplate]);

  const preview = useQuery({
    enabled: Boolean(selectedTemplateId) && !creating,
    queryKey: [
      "events",
      eventId,
      "preparation-preview",
      selectedTemplateId,
      invitationType,
    ],
    queryFn: () =>
      previewInvitation(supabase, eventId, {
        invitationType,
        templateId: selectedTemplateId,
      }),
  });
  const readiness = useQuery({
    enabled: Boolean(selectedTemplateId) && !creating,
    queryKey: ["events", eventId, "preparation-readiness", selectedTemplateId],
    queryFn: () =>
      getPreparationReadiness(supabase, eventId, selectedTemplateId),
  });

  const refreshTemplates = async (template: InvitationTemplate) => {
    setSelectedTemplateId(template.id);
    setCreating(false);
    setDraft(templateToDraft(template));
    await queryClient.invalidateQueries({
      queryKey: ["events", eventId, "templates"],
    });
  };
  const save = useMutation({
    mutationFn: () =>
      selectedTemplate && !creating
        ? updateInvitationTemplate(supabase, eventId, selectedTemplate.id, {
            assetId: draft.assetId || null,
            body: draft.body,
            expectedVersion: selectedTemplate.version,
            extraMessage: draft.extraMessage || null,
            locale: draft.locale,
            name: draft.name,
            providerTemplateName: draft.providerTemplateName || null,
          })
        : createInvitationTemplate(supabase, eventId, {
            assetId: draft.assetId || null,
            body: draft.body,
            extraMessage: draft.extraMessage || undefined,
            locale: draft.locale,
            name: draft.name,
            providerTemplateName: draft.providerTemplateName || undefined,
          }),
    onSuccess: async (template) => {
      await refreshTemplates(template);
      setToast(copy.templateSaved);
    },
  });
  const approve = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) throw new Error("No template selected");
      return approveInvitationTemplate(
        supabase,
        eventId,
        selectedTemplate.id,
        selectedTemplate.version,
      );
    },
    onSuccess: async (template) => {
      await refreshTemplates(template);
      await queryClient.invalidateQueries({
        queryKey: ["events", eventId, "preparation-readiness"],
      });
      setToast(copy.templateApproved);
    },
  });
  const archive = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) throw new Error("No template selected");
      return archiveInvitationTemplate(supabase, eventId, selectedTemplate.id);
    },
    onSuccess: async () => {
      setSelectedTemplateId("");
      await queryClient.invalidateQueries({
        queryKey: ["events", eventId, "templates"],
      });
      setToast(copy.templateArchived);
    },
  });
  const uploadAsset = useMutation({
    mutationFn: (file: File) => uploadInvitationAsset(supabase, eventId, file),
    onSuccess: async (asset) => {
      setDraft((current) => ({ ...current, assetId: asset.id }));
      await queryClient.invalidateQueries({
        queryKey: ["events", eventId, "invitation-assets"],
      });
      setToast(copy.assetUploaded);
    },
  });
  const snapshots = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) throw new Error("No template selected");
      return createPreparationSnapshots(supabase, eventId, {
        templateId: selectedTemplate.id,
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ["events", eventId, "preparation-readiness"],
      });
      setToast(
        replaceCount(
          copy.snapshotsCreated,
          result.createdCount + result.reusedCount,
          locale,
        ),
      );
    },
  });

  if (templates.isLoading) return <PreparationLoading label={copy.loading} />;
  if (templates.isError) {
    return (
      <EmptyState
        action={
          <Button onClick={() => templates.refetch()} variant="secondary">
            {common.retry}
          </Button>
        }
        description={copy.loadErrorDescription}
        icon="circle-alert"
        title={copy.loadErrorTitle}
      />
    );
  }

  const hasUnsavedChanges = Boolean(
    selectedTemplate &&
    !creating &&
    !templateMatchesDraft(selectedTemplate, draft),
  );
  const canSave =
    draft.name.trim().length > 0 &&
    draft.body.trim().length > 0 &&
    (creating || hasUnsavedChanges);
  const summary = readiness.data?.summary;

  return (
    <div className="preparation-stack">
      <div className="preparation-template-bar">
        <Field id="preparation-template" label={copy.templateLabel}>
          <Select
            id="preparation-template"
            onChange={(event) => {
              setCreating(false);
              setSelectedTemplateId(event.currentTarget.value);
            }}
            options={(templates.data ?? []).map((template) => ({
              label: `${template.name} · ${templateStatusLabel(template.status, copy)}`,
              value: template.id,
            }))}
            placeholder={copy.noTemplateOption}
            value={creating ? "" : selectedTemplateId}
          />
        </Field>
        <Button
          icon="plus"
          onClick={() => {
            setCreating(true);
            setSelectedTemplateId("");
            setDraft(blankTemplate(copy, locale));
          }}
          variant="secondary"
        >
          {copy.newTemplate}
        </Button>
      </div>

      {!selectedTemplate && !creating ? (
        <EmptyState
          action={
            <Button
              icon="plus"
              onClick={() => {
                setCreating(true);
                setDraft(blankTemplate(copy, locale));
              }}
            >
              {copy.createFirstTemplate}
            </Button>
          }
          description={copy.noTemplateDescription}
          icon="mail"
          title={copy.noTemplateTitle}
        />
      ) : (
        <>
          <div className="preparation-editor-grid">
            <Card
              actions={
                selectedTemplate ? (
                  <StatusMark
                    label={templateStatusLabel(selectedTemplate.status, copy)}
                    tone={
                      selectedTemplate.status === "APPROVED"
                        ? "success"
                        : selectedTemplate.status === "ARCHIVED"
                          ? "muted"
                          : "pending"
                    }
                  />
                ) : null
              }
              subtitle={copy.editorDescription}
              title={creating ? copy.newTemplate : copy.editorTitle}
            >
              <form
                className="preparation-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canSave) save.mutate();
                }}
              >
                <div className="preparation-form-row">
                  <Field id="template-name" label={copy.templateName} required>
                    <Input
                      id="template-name"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setDraft((current) => ({
                          ...current,
                          name: value,
                        }));
                      }}
                      value={draft.name}
                    />
                  </Field>
                  <Field
                    id="template-locale"
                    label={copy.templateLanguage}
                    required
                  >
                    <Select
                      id="template-locale"
                      onChange={(event) => {
                        const value = event.currentTarget.value as
                          "ar-SA" | "en";
                        setDraft((current) => ({
                          ...current,
                          locale: value,
                        }));
                      }}
                      options={[
                        { label: common.arabic, value: "ar-SA" },
                        { label: common.english, value: "en" },
                      ]}
                      value={draft.locale}
                    />
                  </Field>
                </div>
                <Field
                  hint={copy.providerTemplateNameHint}
                  id="template-provider-name"
                  label={copy.providerTemplateName}
                >
                  <Input
                    dir="ltr"
                    id="template-provider-name"
                    mono
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((current) => ({
                        ...current,
                        providerTemplateName: value,
                      }));
                    }}
                    pattern="[a-z0-9_]+"
                    placeholder={copy.providerTemplateNamePlaceholder}
                    value={draft.providerTemplateName}
                  />
                </Field>
                <Field
                  hint={copy.messageHint}
                  id="template-body"
                  label={copy.messageBody}
                  required
                >
                  <textarea
                    className="preparation-textarea"
                    dir={draft.locale === "ar-SA" ? "rtl" : "ltr"}
                    id="template-body"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((current) => ({
                        ...current,
                        body: value,
                      }));
                    }}
                    rows={8}
                    value={draft.body}
                  />
                </Field>
                <div
                  className="preparation-variables"
                  aria-label={copy.variablesLabel}
                >
                  {MESSAGE_VARIABLES.map((variable) => (
                    <button
                      key={variable}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          body: `${current.body}${current.body ? " " : ""}{{${variable}}}`,
                        }))
                      }
                      type="button"
                    >
                      <Tag size="sm" tone="outline">
                        {copy.variables[variable]}
                      </Tag>
                    </button>
                  ))}
                </div>
                <Field
                  hint={copy.extraMessageHint}
                  id="template-extra"
                  label={copy.extraMessage}
                >
                  <textarea
                    className="preparation-textarea"
                    dir={draft.locale === "ar-SA" ? "rtl" : "ltr"}
                    id="template-extra"
                    maxLength={500}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((current) => ({
                        ...current,
                        extraMessage: value,
                      }));
                    }}
                    rows={3}
                    value={draft.extraMessage}
                  />
                </Field>
                <div className="preparation-asset-row">
                  <Field id="template-asset" label={copy.artwork}>
                    <Select
                      id="template-asset"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setDraft((current) => ({
                          ...current,
                          assetId: value,
                        }));
                      }}
                      options={(assets.data?.items ?? []).map((asset) => ({
                        label: asset.originalFilename,
                        value: asset.id,
                      }))}
                      placeholder={copy.noArtwork}
                      value={draft.assetId}
                    />
                  </Field>
                  <label className="dawah-button dawah-button--secondary dawah-button--md preparation-file-button">
                    <Icon name="file-text" />
                    <span>
                      {uploadAsset.isPending
                        ? copy.uploading
                        : copy.uploadArtwork}
                    </span>
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      aria-label={copy.uploadArtwork}
                      disabled={uploadAsset.isPending}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) uploadAsset.mutate(file);
                        event.currentTarget.value = "";
                      }}
                      type="file"
                    />
                  </label>
                </div>
                {(save.isError || uploadAsset.isError) && (
                  <p className="form-error" role="alert">
                    {copy.saveError}
                  </p>
                )}
                <div className="preparation-actions">
                  <Button
                    disabled={!canSave}
                    loading={save.isPending}
                    type="submit"
                  >
                    {copy.saveTemplate}
                  </Button>
                  {selectedTemplate?.status === "DRAFT" ? (
                    <Button
                      disabled={save.isPending || hasUnsavedChanges}
                      loading={approve.isPending}
                      onClick={() => approve.mutate()}
                      variant="secondary"
                    >
                      {copy.approveTemplate}
                    </Button>
                  ) : null}
                  {selectedTemplate &&
                  selectedTemplate.status !== "ARCHIVED" ? (
                    <Button
                      loading={archive.isPending}
                      onClick={() => archive.mutate()}
                      variant="ghost"
                    >
                      {copy.archiveTemplate}
                    </Button>
                  ) : null}
                  {selectedTemplate && hasUnsavedChanges ? (
                    <Button
                      onClick={() =>
                        setDraft(templateToDraft(selectedTemplate))
                      }
                      variant="ghost"
                    >
                      {copy.discardTemplateChanges}
                    </Button>
                  ) : null}
                </div>
                {hasUnsavedChanges ? (
                  <p className="preparation-unsaved-hint">
                    <Icon name="info" size={14} />
                    {copy.unsavedTemplateChanges}
                  </p>
                ) : null}
              </form>
            </Card>

            <Card subtitle={copy.previewDescription} title={copy.previewTitle}>
              <Tabs
                ariaLabel={copy.invitationTypeLabel}
                items={invitationTypeOptions(copy)}
                onChange={(value) => setInvitationType(value as InvitationType)}
                value={invitationType}
                variant="pill"
              />
              {creating ? (
                <div className="preparation-preview-empty">
                  <Icon name="file-text" size={24} />
                  <p>{copy.saveBeforePreview}</p>
                </div>
              ) : preview.isLoading ? (
                <PreparationLoading label={copy.loadingPreview} compact />
              ) : preview.isError || !preview.data ? (
                <Banner
                  actionLabel={common.retry}
                  kind="warning"
                  onAction={() => preview.refetch()}
                  title={copy.previewError}
                />
              ) : (
                <WhatsAppPreview copy={copy} preview={preview.data} />
              )}
              <p className="preparation-saved-preview-hint">
                <Icon name="info" size={14} />
                {copy.savedPreviewHint}
              </p>
            </Card>
          </div>

          {selectedTemplate ? (
            <Card
              actions={
                <Button
                  disabled={
                    selectedTemplate.status !== "APPROVED" ||
                    hasUnsavedChanges ||
                    !summary?.readyInvitations
                  }
                  loading={snapshots.isPending}
                  onClick={() => snapshots.mutate()}
                  size="sm"
                >
                  {copy.createSnapshots}
                </Button>
              }
              subtitle={copy.readinessDescription}
              title={copy.readinessTitle}
            >
              {readiness.isLoading ? (
                <PreparationLoading label={copy.loadingReadiness} compact />
              ) : readiness.isError || !summary ? (
                <Banner
                  actionLabel={common.retry}
                  kind="warning"
                  onAction={() => readiness.refetch()}
                  title={copy.readinessError}
                />
              ) : (
                <>
                  <div className="preparation-stat-grid">
                    <StatCard
                      context={copy.invitationGroupsUnit}
                      icon="mail"
                      label={copy.totalInvitations}
                      locale={locale}
                      value={summary.totalInvitations}
                    />
                    <StatCard
                      context={copy.invitationGroupsUnit}
                      icon="circle-check"
                      label={copy.readyInvitations}
                      locale={locale}
                      tone="accepted"
                      value={summary.readyInvitations}
                    />
                    <StatCard
                      context={copy.invitationGroupsUnit}
                      icon="circle-alert"
                      label={copy.blockedInvitations}
                      locale={locale}
                      tone="declined"
                      value={summary.blockedInvitations}
                    />
                    <StatCard
                      context={copy.invitationGroupsUnit}
                      icon="file-text"
                      label={copy.snapshottedInvitations}
                      locale={locale}
                      value={summary.snapshottedInvitations}
                    />
                  </div>
                  {summary.blockedInvitations > 0 ? (
                    <div className="preparation-issues">
                      <strong>{copy.blockedReasons}</strong>
                      <ul>
                        {(readiness.data?.items ?? [])
                          .filter((item) => !item.ready)
                          .flatMap((item) => item.issues)
                          .slice(0, 5)
                          .map((issue, index) => (
                            <li key={`${issue.code}-${index}`}>
                              {issue.message}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : (
                    <Banner
                      icon="circle-check"
                      kind="success"
                      title={copy.allReady}
                    />
                  )}
                </>
              )}
              {snapshots.isError ? (
                <p className="form-error" role="alert">
                  {copy.snapshotError}
                </p>
              ) : null}
            </Card>
          ) : null}
        </>
      )}
      {toast ? (
        <div className="preparation-toast">
          <Toast
            dismissLabel={copy.dismiss}
            kind="success"
            onDismiss={() => setToast("")}
            title={toast}
          />
        </div>
      ) : null}
    </div>
  );
}

function ImportPreparation({
  common,
  copy,
  eventId,
  locale,
  supabase,
}: EventPreparationProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [rowPage, setRowPage] = useState(1);
  const [rowStatus, setRowStatus] = useState<"" | ImportRow["status"]>("");
  const [mapping, setMapping] = useState(emptyMapping);
  const [editingRow, setEditingRow] = useState<ImportRow | null>(null);
  const [corrections, setCorrections] = useState(emptyMapping);
  const [duplicatePolicy, setDuplicatePolicy] = useState<"SKIP" | "IMPORT">(
    "SKIP",
  );
  const [toast, setToast] = useState("");
  const limits = useQuery({
    queryKey: ["events", eventId, "imports", "limits"],
    queryFn: () => getImportLimits(supabase, eventId),
  });
  const jobs = useQuery({
    queryKey: ["events", eventId, "imports"],
    queryFn: () => listImportJobs(supabase, eventId),
  });
  const detail = useQuery({
    enabled: Boolean(selectedJobId),
    queryKey: ["events", eventId, "imports", selectedJobId, rowPage, rowStatus],
    queryFn: () =>
      getImportJob(supabase, eventId, selectedJobId, {
        page: rowPage,
        pageSize: 50,
        rowStatus: rowStatus || undefined,
      }),
    refetchInterval: (query) =>
      isImportProcessing(query.state.data?.job.status) ? 2_000 : false,
  });

  useEffect(() => {
    if (!selectedJobId && jobs.data?.items.length) {
      setSelectedJobId(jobs.data.items[0]?.id ?? "");
    }
  }, [jobs.data, selectedJobId]);

  useEffect(() => {
    const job = detail.data?.job;
    if (!job) return;
    setMapping({
      ...emptyMapping,
      ...job.suggestedMapping,
      ...job.columnMapping,
    });
  }, [detail.data?.job.id, detail.data?.job.version]);

  const refreshImports = async (jobId = selectedJobId) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["events", eventId, "imports"],
      }),
      jobId
        ? queryClient.invalidateQueries({
            queryKey: ["events", eventId, "imports", jobId],
          })
        : Promise.resolve(),
    ]);
  };
  const upload = useMutation({
    mutationFn: (file: File) => createImportJob(supabase, eventId, file),
    onSuccess: async (job) => {
      setRowPage(1);
      setRowStatus("");
      setSelectedJobId(job.id);
      await refreshImports(job.id);
      setToast(copy.importUploaded);
    },
  });
  const saveMapping = useMutation({
    mutationFn: () => {
      const job = detail.data?.job;
      if (!job) throw new Error("No import selected");
      return updateImportMapping(supabase, eventId, job.id, {
        expectedVersion: job.version,
        mapping: compactMapping(mapping),
      });
    },
    onSuccess: async () => {
      await refreshImports();
      setToast(copy.mappingSaved);
    },
  });
  const saveCorrection = useMutation({
    mutationFn: () => {
      const job = detail.data?.job;
      if (!job || !editingRow) throw new Error("No row selected");
      const companionValue = corrections.maxCompanions.trim();
      const parsedCompanionValue = Number(companionValue);
      const corrected: UpdateImportRowInput["corrections"] = {
        contactName: corrections.contactName || null,
        displayName: corrections.displayName,
        internalNote: corrections.internalNote || null,
        invitationType: corrections.invitationType || null,
        maxCompanions:
          companionValue === ""
            ? null
            : Number.isFinite(parsedCompanionValue)
              ? parsedCompanionValue
              : companionValue,
        members: corrections.members || null,
        phoneCountry: corrections.phoneCountry || null,
        phoneNumber: corrections.phoneNumber,
      };
      return updateImportRow(supabase, eventId, job.id, editingRow.id, {
        corrections: corrected,
        expectedJobVersion: job.version,
      });
    },
    onSuccess: async () => {
      setEditingRow(null);
      await refreshImports();
      setToast(copy.rowSaved);
    },
  });
  const confirm = useMutation({
    mutationFn: () => {
      const job = detail.data?.job;
      if (!job) throw new Error("No import selected");
      return confirmImportJob(supabase, eventId, job.id, {
        duplicatePolicy,
        expectedVersion: job.version,
      });
    },
    onSuccess: async (result) => {
      await refreshImports();
      setToast(replaceCount(copy.importCompleted, result.importedRows, locale));
    },
  });
  const cancel = useMutation({
    mutationFn: () => {
      const job = detail.data?.job;
      if (!job) throw new Error("No import selected");
      return cancelImportJob(supabase, eventId, job.id);
    },
    onSuccess: async () => {
      await refreshImports();
      setToast(copy.importCancelled);
    },
  });

  const job = detail.data?.job;
  const canMap = Boolean(job?.headers.length);
  const canConfirm =
    job?.status === "READY" && job.invalidRows === 0 && job.validRows > 0;
  const rowColumns = useMemo(
    () =>
      importRowColumns(copy, locale, job, (row) =>
        openCorrection(row, job, setEditingRow, setCorrections),
      ),
    [copy, job, locale],
  );

  return (
    <div className="preparation-stack">
      <Card subtitle={copy.uploadDescription} title={copy.uploadTitle}>
        <div
          className="preparation-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) upload.mutate(file);
          }}
        >
          <Icon name="file-text" size={28} />
          <div>
            <strong>{copy.dropFile}</strong>
            <p>
              {limits.data
                ? copy.fileRules
                    .replace(
                      "{size}",
                      formatFileSize(limits.data.maximumFileBytes, locale),
                    )
                    .replace(
                      "{rows}",
                      formatNumber(limits.data.maximumRows, locale),
                    )
                : copy.fileRulesLoading}
            </p>
          </div>
          <Button
            loading={upload.isPending}
            onClick={() => fileRef.current?.click()}
            variant="secondary"
          >
            {copy.chooseFile}
          </Button>
          <input
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label={copy.chooseFile}
            className="dawah-sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) upload.mutate(file);
              event.currentTarget.value = "";
            }}
            ref={fileRef}
            type="file"
          />
        </div>
        {upload.isError ? (
          <p className="form-error" role="alert">
            {copy.uploadError}
          </p>
        ) : null}
      </Card>

      {jobs.data?.items.length ? (
        <div className="preparation-job-picker">
          <Field id="import-job" label={copy.importJobLabel}>
            <Select
              id="import-job"
              onChange={(event) => {
                setRowPage(1);
                setRowStatus("");
                setSelectedJobId(event.currentTarget.value);
              }}
              options={jobs.data.items.map((item) => ({
                label: `${item.originalFilename} · ${importStatusLabel(item.status, copy)}`,
                value: item.id,
              }))}
              value={selectedJobId}
            />
          </Field>
        </div>
      ) : null}

      {jobs.isLoading ? (
        <PreparationLoading label={copy.loadingImport} />
      ) : jobs.isError ? (
        <Banner
          actionLabel={common.retry}
          kind="danger"
          onAction={() => jobs.refetch()}
          title={copy.importLoadError}
        />
      ) : detail.isLoading ? (
        <PreparationLoading label={copy.loadingImport} />
      ) : detail.isError ? (
        <Banner
          actionLabel={common.retry}
          kind="danger"
          onAction={() => detail.refetch()}
          title={copy.importLoadError}
        />
      ) : !job ? (
        <EmptyState
          description={copy.noImportDescription}
          icon="file-text"
          title={copy.noImportTitle}
        />
      ) : (
        <>
          <ImportProgress copy={copy} job={job} locale={locale} />

          {isImportProcessing(job.status) ? (
            <Banner icon="clock" kind="info" title={copy.processingImport} />
          ) : job.status === "FAILED" ? (
            <Banner
              description={job.failureMessage ?? copy.importFailedDescription}
              icon="circle-alert"
              kind="danger"
              title={copy.importFailed}
            />
          ) : job.status === "CANCELLED" ? (
            <Banner icon="ban" kind="info" title={copy.importCancelled} />
          ) : job.status === "COMPLETED" ? (
            <Banner
              description={replaceCount(
                copy.importedRowsSummary,
                job.importedRows,
                locale,
              )}
              icon="circle-check"
              kind="success"
              title={copy.importCompleteTitle}
            />
          ) : (
            <>
              {canMap ? (
                <Card
                  subtitle={copy.mappingDescription}
                  title={copy.mappingTitle}
                >
                  <form
                    className="preparation-mapping-grid"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveMapping.mutate();
                    }}
                  >
                    {IMPORT_MAPPING_FIELDS.map((field) => (
                      <Field
                        id={`mapping-${field}`}
                        key={field}
                        label={copy.mappingFields[field]}
                        required={
                          field === "displayName" || field === "phoneNumber"
                        }
                      >
                        <Select
                          id={`mapping-${field}`}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setMapping((current) => ({
                              ...current,
                              [field]: value,
                            }));
                          }}
                          options={job.headers.map((header) => ({
                            label: header,
                            value: header,
                          }))}
                          placeholder={copy.notMapped}
                          value={mapping[field]}
                        />
                      </Field>
                    ))}
                    <div className="preparation-mapping-actions">
                      <Button
                        disabled={!mapping.displayName || !mapping.phoneNumber}
                        loading={saveMapping.isPending}
                        type="submit"
                      >
                        {copy.validateRows}
                      </Button>
                    </div>
                  </form>
                  {saveMapping.isError ? (
                    <p className="form-error" role="alert">
                      {copy.mappingError}
                    </p>
                  ) : null}
                </Card>
              ) : null}

              {detail.data ? (
                <Card
                  actions={
                    <StatusMark
                      label={importStatusLabel(job.status, copy)}
                      tone={job.invalidRows ? "danger" : "success"}
                    />
                  }
                  subtitle={copy.reviewDescription}
                  title={copy.reviewTitle}
                >
                  <div className="preparation-import-counts">
                    <span>
                      <strong>{formatNumber(job.validRows, locale)}</strong>{" "}
                      {copy.readyRows}
                    </span>
                    <span>
                      <strong>{formatNumber(job.invalidRows, locale)}</strong>{" "}
                      {copy.invalidRows}
                    </span>
                    <span>
                      <strong>{formatNumber(job.duplicateRows, locale)}</strong>{" "}
                      {copy.duplicateRows}
                    </span>
                  </div>
                  <div className="preparation-review-toolbar">
                    <Field id="row-status-filter" label={copy.rowStatusFilter}>
                      <Select
                        id="row-status-filter"
                        onChange={(event) => {
                          setRowPage(1);
                          setRowStatus(
                            event.currentTarget.value as
                              "" | ImportRow["status"],
                          );
                        }}
                        options={IMPORT_ROW_STATUSES.map((status) => ({
                          label: copy.rowStatuses[status],
                          value: status,
                        }))}
                        placeholder={copy.allRowStatuses}
                        value={rowStatus}
                      />
                    </Field>
                  </div>
                  <Table
                    columns={rowColumns}
                    emptyState={
                      <EmptyState
                        description={copy.noRowsDescription}
                        icon="file-text"
                        title={copy.noRowsTitle}
                      />
                    }
                    getRowKey={(row) => row.id}
                    renderMobile={(row) => (
                      <ImportRowMobile
                        copy={copy}
                        job={job}
                        locale={locale}
                        onEdit={() =>
                          openCorrection(
                            row,
                            job,
                            setEditingRow,
                            setCorrections,
                          )
                        }
                        row={row}
                      />
                    )}
                    rows={detail.data.rows}
                  />
                  <div className="preparation-pagination">
                    <span className="preparation-pagination-note">
                      {copy.rowsShown
                        .replace(
                          "{shown}",
                          formatNumber(detail.data.rows.length, locale),
                        )
                        .replace(
                          "{total}",
                          formatNumber(
                            detail.data.pagination.totalItems,
                            locale,
                          ),
                        )}
                    </span>
                    <div className="preparation-pagination__actions">
                      <Button
                        disabled={rowPage <= 1}
                        onClick={() =>
                          setRowPage((current) => Math.max(1, current - 1))
                        }
                        size="sm"
                        variant="secondary"
                      >
                        {copy.previousRowsPage}
                      </Button>
                      <span>
                        {copy.rowsPageSummary
                          .replace("{page}", formatNumber(rowPage, locale))
                          .replace(
                            "{total}",
                            formatNumber(
                              Math.max(detail.data.pagination.totalPages, 1),
                              locale,
                            ),
                          )}
                      </span>
                      <Button
                        disabled={
                          rowPage >=
                          Math.max(detail.data.pagination.totalPages, 1)
                        }
                        onClick={() => setRowPage((current) => current + 1)}
                        size="sm"
                        variant="secondary"
                      >
                        {copy.nextRowsPage}
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : null}

              <Card
                subtitle={copy.confirmDescription}
                title={copy.confirmTitle}
              >
                {job.duplicateRows ? (
                  <Field id="duplicate-policy" label={copy.duplicatePolicy}>
                    <Select
                      id="duplicate-policy"
                      onChange={(event) =>
                        setDuplicatePolicy(
                          event.currentTarget.value as "SKIP" | "IMPORT",
                        )
                      }
                      options={[
                        { label: copy.skipDuplicates, value: "SKIP" },
                        { label: copy.importDuplicates, value: "IMPORT" },
                      ]}
                      value={duplicatePolicy}
                    />
                  </Field>
                ) : null}
                {job.invalidRows > 0 ? (
                  <Banner
                    icon="circle-alert"
                    kind="warning"
                    title={replaceCount(
                      copy.fixRowsBeforeConfirm,
                      job.invalidRows,
                      locale,
                    )}
                  />
                ) : null}
                <div className="preparation-confirm-actions">
                  <Button
                    disabled={!canConfirm}
                    loading={confirm.isPending}
                    onClick={() => confirm.mutate()}
                  >
                    {copy.confirmImport}
                  </Button>
                  <Button
                    loading={cancel.isPending}
                    onClick={() => cancel.mutate()}
                    variant="danger-soft"
                  >
                    {copy.cancelImport}
                  </Button>
                </div>
                {confirm.isError || cancel.isError ? (
                  <p className="form-error" role="alert">
                    {copy.confirmError}
                  </p>
                ) : null}
              </Card>
            </>
          )}
        </>
      )}

      <Drawer
        className="preparation-row-drawer"
        closeLabel={common.close}
        description={copy.rowCorrectionDescription}
        footer={
          <>
            <Button onClick={() => setEditingRow(null)} variant="secondary">
              {common.cancel}
            </Button>
            <Button
              loading={saveCorrection.isPending}
              onClick={() => saveCorrection.mutate()}
            >
              {copy.saveCorrection}
            </Button>
          </>
        }
        onClose={() => setEditingRow(null)}
        open={Boolean(editingRow)}
        title={
          editingRow
            ? copy.rowCorrectionTitle.replace(
                "{row}",
                formatNumber(editingRow.rowNumber, locale),
              )
            : copy.rowCorrectionTitle.replace("{row}", "")
        }
      >
        <div className="preparation-form">
          {IMPORT_MAPPING_FIELDS.map((field) => (
            <Field
              id={`correction-${field}`}
              key={field}
              label={copy.mappingFields[field]}
            >
              <Input
                id={`correction-${field}`}
                mono={field === "phoneNumber"}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setCorrections((current) => ({
                    ...current,
                    [field]: value,
                  }));
                }}
                value={corrections[field]}
              />
            </Field>
          ))}
          {editingRow?.errors.length ? (
            <div className="preparation-issues">
              <strong>{copy.rowIssues}</strong>
              <ul>
                {editingRow.errors.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {saveCorrection.isError ? (
            <p className="form-error" role="alert">
              {copy.correctionError}
            </p>
          ) : null}
        </div>
      </Drawer>

      {toast ? (
        <div className="preparation-toast">
          <Toast
            dismissLabel={copy.dismiss}
            kind="success"
            onDismiss={() => setToast("")}
            title={toast}
          />
        </div>
      ) : null}
    </div>
  );
}

function WhatsAppPreview({
  copy,
  preview,
}: {
  copy: Dictionary["preparation"];
  preview: Awaited<ReturnType<typeof previewInvitation>>;
}) {
  return (
    <div
      className="preparation-whatsapp"
      dir={preview.locale === "ar-SA" ? "rtl" : "ltr"}
    >
      <div className="preparation-whatsapp__bubble">
        <p>{preview.renderedBody}</p>
        {preview.renderedExtraMessage ? (
          <p>{preview.renderedExtraMessage}</p>
        ) : null}
        <p className="preparation-whatsapp__scope">
          {preview.scopeDescription}
        </p>
        <time>{copy.previewTime}</time>
      </div>
      <div className="preparation-whatsapp__action">
        <Icon name="eye" size={15} />
        {copy.viewInvitation}
      </div>
      {preview.replyActions.map((action) => (
        <div className="preparation-whatsapp__action" key={action}>
          <Icon name="reply" size={15} />
          {action}
        </div>
      ))}
    </div>
  );
}

function ImportProgress({
  copy,
  job,
  locale,
}: {
  copy: Dictionary["preparation"];
  job: ImportDetail["job"];
  locale: AppLocale;
}) {
  const step = importStep(job.status);
  const labels = [
    copy.stepUpload,
    copy.stepMap,
    copy.stepReview,
    copy.stepComplete,
  ];
  return (
    <Card
      actions={
        <StatusMark
          label={importStatusLabel(job.status, copy)}
          tone={job.status === "FAILED" ? "danger" : "pending"}
        />
      }
      subtitle={`${job.originalFilename} · ${formatFileSize(job.fileSizeBytes, locale)}`}
      title={copy.importProgressTitle}
    >
      <ol className="preparation-steps">
        {labels.map((label, index) => (
          <li
            aria-current={index === step ? "step" : undefined}
            className={index < step ? "is-complete" : undefined}
            key={label}
          >
            <span>
              {index < step ? (
                <Icon name="check" size={14} />
              ) : (
                formatNumber(index + 1, locale)
              )}
            </span>
            <small>{label}</small>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function StatusMark({
  label,
  tone,
}: {
  label: string;
  tone: "danger" | "muted" | "pending" | "success";
}) {
  const icon =
    tone === "success"
      ? "circle-check"
      : tone === "danger"
        ? "circle-alert"
        : tone === "pending"
          ? "clock"
          : "circle-dashed";
  return (
    <span className={`preparation-status preparation-status--${tone}`}>
      <Icon name={icon} size={14} />
      {label}
    </span>
  );
}

function PreparationLoading({
  compact = false,
  label,
}: {
  compact?: boolean;
  label: string;
}) {
  return (
    <div aria-label={label} className="preparation-loading" role="status">
      <Icon className="dawah-spin" name="loader-circle" />
      <span>{label}</span>
      {!compact ? (
        <div className="skeleton preparation-loading__panel" />
      ) : null}
    </div>
  );
}

function ImportRowMobile({
  copy,
  job,
  locale,
  onEdit,
  row,
}: {
  copy: Dictionary["preparation"];
  job: ImportDetail["job"];
  locale: AppLocale;
  onEdit: () => void;
  row: ImportRow;
}) {
  return (
    <div className="preparation-row-mobile">
      <div>
        <strong>
          {row.normalizedData?.displayName ??
            sourceValue(row, "displayName", job) ??
            copy.unnamedRow}
        </strong>
        <span>
          {copy.rowNumber.replace("{row}", formatNumber(row.rowNumber, locale))}
        </span>
      </div>
      <StatusMark
        label={importRowStatusLabel(row.status, copy)}
        tone={
          row.status === "INVALID"
            ? "danger"
            : row.status === "VALID"
              ? "success"
              : "pending"
        }
      />
      <Button
        disabled={row.status === "IMPORTED" || row.status === "SKIPPED"}
        onClick={onEdit}
        size="sm"
        variant="secondary"
      >
        {copy.correctRow}
      </Button>
    </div>
  );
}

function importRowColumns(
  copy: Dictionary["preparation"],
  locale: AppLocale,
  job: ImportDetail["job"] | undefined,
  onEdit: (row: ImportRow) => void,
) {
  return [
    {
      align: "end" as const,
      header: copy.rowColumn,
      key: "row",
      render: (row: ImportRow) => (
        <span className="num">{formatNumber(row.rowNumber, locale)}</span>
      ),
      width: 70,
    },
    {
      header: copy.nameColumn,
      key: "name",
      render: (row: ImportRow) => (
        <strong>
          {row.normalizedData?.displayName ??
            sourceValue(row, "displayName", job) ??
            copy.unnamedRow}
        </strong>
      ),
      wrap: true,
    },
    {
      header: copy.phoneColumn,
      key: "phone",
      render: (row: ImportRow) => (
        <span className="phone" dir="ltr">
          {row.normalizedData?.phoneE164 ??
            sourceValue(row, "phoneNumber", job) ??
            "—"}
        </span>
      ),
    },
    {
      header: copy.rowStatusColumn,
      key: "status",
      render: (row: ImportRow) => (
        <StatusMark
          label={importRowStatusLabel(row.status, copy)}
          tone={
            row.status === "INVALID"
              ? "danger"
              : row.status === "VALID" || row.status === "IMPORTED"
                ? "success"
                : row.status === "SKIPPED"
                  ? "muted"
                  : "pending"
          }
        />
      ),
    },
    {
      header: copy.issueColumn,
      key: "issues",
      render: (row: ImportRow) => (
        <span className="preparation-table-issue">
          {row.errors[0]?.message ?? row.warnings[0]?.message ?? copy.noIssues}
        </span>
      ),
      wrap: true,
    },
    {
      align: "end" as const,
      header: copy.actionsColumn,
      key: "actions",
      render: (row: ImportRow) => (
        <Button
          disabled={row.status === "IMPORTED" || row.status === "SKIPPED"}
          onClick={() => onEdit(row)}
          size="sm"
          variant="ghost"
        >
          {copy.correctRow}
        </Button>
      ),
    },
  ];
}

function openCorrection(
  row: ImportRow,
  job: ImportDetail["job"] | undefined,
  setEditingRow: (row: ImportRow) => void,
  setCorrections: (corrections: Record<MappingField, string>) => void,
) {
  const normalized = row.normalizedData;
  setCorrections({
    contactName:
      normalized?.contactName ?? sourceValue(row, "contactName", job) ?? "",
    displayName:
      normalized?.displayName ?? sourceValue(row, "displayName", job) ?? "",
    internalNote:
      normalized?.internalNote ?? sourceValue(row, "internalNote", job) ?? "",
    invitationType:
      normalized?.invitationType ??
      sourceValue(row, "invitationType", job) ??
      "",
    maxCompanions: normalized
      ? String(normalized.maxCompanions)
      : (sourceValue(row, "maxCompanions", job) ?? ""),
    members:
      normalized?.members.map((member) => member.name).join(" | ") ??
      sourceValue(row, "members", job) ??
      "",
    phoneCountry:
      normalized?.phoneCountry ?? sourceValue(row, "phoneCountry", job) ?? "",
    phoneNumber:
      normalized?.phoneE164 ?? sourceValue(row, "phoneNumber", job) ?? "",
  });
  setEditingRow(row);
}

function sourceValue(
  row: ImportRow,
  field: MappingField,
  job?: ImportDetail["job"],
) {
  const corrected = row.correctedData?.[field];
  if (typeof corrected === "string" || typeof corrected === "number") {
    return String(corrected);
  }
  const column = job?.columnMapping?.[field] ?? job?.suggestedMapping?.[field];
  const value = column ? row.sourceData[column] : row.sourceData[field];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

function compactMapping(mapping: Record<MappingField, string>) {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, column]) => column),
  ) as ImportColumnMappingInput;
}

function blankTemplate(
  copy: Dictionary["preparation"],
  locale: AppLocale,
): TemplateDraft {
  return {
    assetId: "",
    body: copy.defaultBody,
    extraMessage: copy.defaultExtraMessage,
    locale,
    name: copy.defaultTemplateName,
    providerTemplateName: "",
  };
}

function templateToDraft(template: InvitationTemplate): TemplateDraft {
  return {
    assetId: template.assetId ?? "",
    body: template.body,
    extraMessage: template.extraMessage ?? "",
    locale: template.locale,
    name: template.name,
    providerTemplateName: template.providerTemplateName ?? "",
  };
}

function templateMatchesDraft(
  template: InvitationTemplate,
  draft: TemplateDraft,
): boolean {
  return (
    (template.assetId ?? "") === draft.assetId &&
    template.body === draft.body &&
    (template.extraMessage ?? "") === draft.extraMessage &&
    template.locale === draft.locale &&
    template.name === draft.name &&
    (template.providerTemplateName ?? "") === draft.providerTemplateName
  );
}

function invitationTypeOptions(copy: Dictionary["preparation"]) {
  return [
    { id: "SINGLE", label: copy.singleInvitation },
    { id: "NAMED_GROUP", label: copy.namedGroupInvitation },
    {
      id: "PRIMARY_WITH_COMPANIONS",
      label: copy.companionsInvitation,
    },
  ];
}

function templateStatusLabel(
  status: InvitationTemplate["status"],
  copy: Dictionary["preparation"],
) {
  return {
    APPROVED: copy.statusApproved,
    ARCHIVED: copy.statusArchived,
    DRAFT: copy.statusDraft,
  }[status];
}

function importStatusLabel(
  status: ImportDetail["job"]["status"],
  copy: Dictionary["preparation"],
) {
  return copy.importStatuses[status];
}

function importRowStatusLabel(
  status: ImportRow["status"],
  copy: Dictionary["preparation"],
) {
  return copy.rowStatuses[status];
}

function isImportProcessing(status: ImportDetail["job"]["status"] | undefined) {
  return (
    status === "UPLOADED" ||
    status === "PARSING" ||
    status === "VALIDATING" ||
    status === "IMPORTING"
  );
}

function importStep(status: ImportDetail["job"]["status"]) {
  if (status === "COMPLETED") return 3;
  if (
    status === "REVIEWING" ||
    status === "READY" ||
    status === "VALIDATING" ||
    status === "IMPORTING"
  ) {
    return 2;
  }
  if (status === "AWAITING_MAPPING") return 1;
  return 0;
}

function formatNumber(value: number, locale: AppLocale) {
  return new Intl.NumberFormat(locale).format(value);
}

function formatFileSize(bytes: number, locale: AppLocale) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    bytes / 1_048_576,
  )} MB`;
}

function replaceCount(message: string, count: number, locale: AppLocale) {
  return message.replace("{count}", formatNumber(count, locale));
}
