"use client";

import type {
  CheckInParty,
  CheckInResult,
  CreateCheckInInput,
} from "@dawah/api-contract";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Phone,
  Skeleton,
  StatCard,
  Tag,
  Toast,
} from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useRef, useState } from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import {
  ApiClientError,
  createCheckIn,
  getCheckInDashboard,
  resolveEntryPass,
  searchCheckInParties,
} from "../lib/api";
import type { getSupabaseClient } from "../lib/supabase";

interface EventCheckInProps {
  common: Dictionary["common"];
  copy: Dictionary["checkIn"];
  eventId: string;
  locale: AppLocale;
  supabase: ReturnType<typeof getSupabaseClient>;
}

interface BarcodeReader {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

const DASHBOARD_REFRESH_INTERVAL_MILLISECONDS = 15_000;
const SCAN_INTERVAL_MILLISECONDS = 400;
const DISABLED_CODES = new Set([
  "CHECK_IN_FEATURE_DISABLED",
  "CHECK_IN_DISABLED",
  "CHECK_IN_EVENT_NOT_ACTIVE",
]);

export function EventCheckIn({
  common,
  copy,
  eventId,
  locale,
  supabase,
}: EventCheckInProps) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [party, setParty] = useState<CheckInParty | null>(null);
  const [attendeeCount, setAttendeeCount] = useState(1);
  const [source, setSource] = useState<CreateCheckInInput["source"]>("MANUAL");
  const [outcome, setOutcome] = useState<CheckInResult | null>(null);
  const [notice, setNotice] = useState("");

  const dashboard = useQuery({
    queryKey: ["events", eventId, "check-ins", "dashboard"],
    queryFn: () => getCheckInDashboard(supabase, eventId),
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MILLISECONDS,
    retry: false,
  });
  const search = useQuery({
    queryKey: ["events", eventId, "check-ins", "search", submittedSearch],
    enabled: submittedSearch.length >= 2,
    queryFn: () =>
      searchCheckInParties(supabase, eventId, {
        limit: 20,
        query: submittedSearch,
      }),
  });

  const refreshDashboard = () =>
    queryClient.invalidateQueries({
      queryKey: ["events", eventId, "check-ins"],
    });

  const openParty = (
    selected: CheckInParty,
    from: CreateCheckInInput["source"],
  ) => {
    setSource(from);
    setParty(selected);
    setAttendeeCount(Math.max(1, selected.remainingAttendance));
  };

  const resolve = useMutation({
    mutationFn: (scanned: string) =>
      resolveEntryPass(supabase, eventId, { token: scanned }),
    onSuccess: (resolved) => {
      setToken("");
      openParty(resolved, "QR");
    },
  });

  const confirm = useMutation({
    mutationFn: () => {
      if (!party) throw new Error("No party selected");
      return createCheckIn(
        supabase,
        eventId,
        {
          attendeeCount,
          invitationGroupId: party.invitationGroupId,
          source,
        },
        idempotencyKey(),
      );
    },
    onSuccess: async (result) => {
      setParty(null);
      setOutcome(result);
      setNotice(outcomeNotice(result, copy));
      await refreshDashboard();
      if (submittedSearch.length >= 2) await search.refetch();
    },
  });

  const camera = useEntryPassCamera((scanned) => resolve.mutate(scanned));

  const disabledCode = checkInDisabledCode(dashboard.error);
  if (disabledCode) {
    return (
      <EmptyState
        description={copy.disabledDescription}
        icon="lock"
        title={copy.disabledTitle}
      />
    );
  }

  return (
    <div className="check-in-page">
      <header className="workspace-page-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <Button onClick={() => void dashboard.refetch()} variant="secondary">
          {copy.refresh}
        </Button>
      </header>

      {dashboard.isLoading ? (
        <CheckInLoading label={copy.loading} />
      ) : dashboard.isError || !dashboard.data ? (
        <EmptyState
          action={
            <Button onClick={() => dashboard.refetch()} variant="secondary">
              {common.retry}
            </Button>
          }
          description={copy.loadError}
          icon="circle-alert"
          title={copy.loadError}
        />
      ) : (
        <div className="workspace-stat-grid">
          <StatCard
            context={copy.peopleUnit}
            label={copy.expected}
            locale={locale}
            value={dashboard.data.expectedAttendance}
          />
          <StatCard
            context={copy.peopleUnit}
            label={copy.arrived}
            locale={locale}
            tone="checkedin"
            value={dashboard.data.checkedInAttendance}
          />
          <StatCard
            context={copy.peopleUnit}
            label={copy.remaining}
            locale={locale}
            tone="pending"
            value={dashboard.data.remainingAttendance}
          />
          <StatCard
            context={copy.groupsUnit}
            label={copy.completeGroups}
            locale={locale}
            tone="accepted"
            value={dashboard.data.fullyCheckedInGroups}
          />
        </div>
      )}

      <div className="workspace-grid-two">
        <Card subtitle={copy.scanDescription} title={copy.scanTitle}>
          <div className="check-in-scanner">
            {camera.supported ? (
              <>
                <video
                  aria-label={copy.scanTitle}
                  className="check-in-scanner__video"
                  muted
                  playsInline
                  ref={camera.videoRef}
                />
                <Button
                  icon="scan-line"
                  onClick={camera.active ? camera.stop : camera.start}
                  variant="secondary"
                >
                  {camera.active ? copy.stopCamera : copy.startCamera}
                </Button>
              </>
            ) : (
              <p className="check-in-scanner__fallback">
                {copy.cameraUnavailable}
              </p>
            )}
            <Field
              hint={copy.tokenPlaceholder}
              id="entry-pass-token"
              label={copy.tokenLabel}
            >
              <Input
                mono
                onChange={(event) => setToken(event.currentTarget.value)}
                placeholder={copy.tokenPlaceholder}
                value={token}
              />
            </Field>
            <Button
              disabled={token.trim().length === 0 || resolve.isPending}
              loading={resolve.isPending}
              onClick={() => resolve.mutate(token.trim())}
            >
              {resolve.isPending ? copy.resolving : copy.resolve}
            </Button>
            {resolve.isError ? (
              <Toast
                dismissLabel={common.close}
                kind="error"
                onDismiss={() => resolve.reset()}
                title={copy.resolveError}
              />
            ) : null}
          </div>
        </Card>

        <Card title={copy.searchTitle}>
          <form
            className="check-in-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmittedSearch(searchTerm.trim());
            }}
          >
            <Field
              hint={copy.searchPlaceholder}
              id="check-in-search"
              label={copy.searchLabel}
            >
              <Input
                icon="search"
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                placeholder={copy.searchPlaceholder}
                value={searchTerm}
              />
            </Field>
            <Button
              disabled={searchTerm.trim().length < 2 || search.isFetching}
              loading={search.isFetching}
              type="submit"
            >
              {search.isFetching ? copy.searching : copy.search}
            </Button>
          </form>
          {submittedSearch.length >= 2 && search.data ? (
            search.data.items.length === 0 ? (
              <p className="check-in-empty">{copy.noResults}</p>
            ) : (
              <ul className="check-in-party-list">
                {search.data.items.map((item) => (
                  <li className="check-in-party" key={item.invitationGroupId}>
                    <div className="check-in-party__details">
                      <strong>{item.displayName}</strong>
                      {item.phoneDisplay ? (
                        <small>
                          <Phone
                            aria-label={
                              item.phoneMasked ? copy.maskedPhone : undefined
                            }
                            value={item.phoneDisplay}
                          />
                        </small>
                      ) : null}
                      <div className="check-in-party__meta">
                        <Tag size="sm" tone="outline">
                          {interpolate(copy.partyConfirmed, {
                            count: formatNumber(
                              item.confirmedAttendance,
                              locale,
                            ),
                          })}
                        </Tag>
                        <Tag
                          size="sm"
                          tone={
                            item.status === "CHECKED_IN" ? "accent" : "neutral"
                          }
                        >
                          {interpolate(copy.partyCheckedIn, {
                            count: formatNumber(
                              item.checkedInAttendance,
                              locale,
                            ),
                          })}
                        </Tag>
                      </div>
                    </div>
                    <Button
                      disabled={item.remainingAttendance === 0}
                      onClick={() => openParty(item, "MANUAL")}
                      size="sm"
                      variant="secondary"
                    >
                      {interpolate(copy.selectParty, {
                        name: item.displayName,
                      })}
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Card>
      </div>

      <Card title={copy.recentTitle}>
        {dashboard.data && dashboard.data.recentArrivals.length > 0 ? (
          <ul className="check-in-recent-list">
            {dashboard.data.recentArrivals.map((arrival) => (
              <li className="check-in-recent" key={arrival.recordId}>
                <div>
                  <strong>{arrival.displayName}</strong>
                  <small>{formatDateTime(arrival.checkedInAt, locale)}</small>
                </div>
                <Tag size="sm" tone="accent">
                  {interpolate(copy.peopleCount, {
                    count: formatNumber(arrival.attendeeCount, locale),
                  })}
                </Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p className="check-in-empty">{copy.noRecent}</p>
        )}
      </Card>

      <Dialog
        closeLabel={common.close}
        onClose={() => setParty(null)}
        open={party !== null}
        title={copy.confirmTitle}
      >
        {party ? (
          <div className="check-in-confirm">
            <p>
              <strong>{party.displayName}</strong>
            </p>
            <p>
              {interpolate(copy.partyConfirmed, {
                count: formatNumber(party.confirmedAttendance, locale),
              })}{" "}
              ·{" "}
              {interpolate(copy.partyCheckedIn, {
                count: formatNumber(party.checkedInAttendance, locale),
              })}
            </p>
            <Field id="check-in-attendees" label={copy.attendeeCount}>
              <Input
                inputMode="numeric"
                max={Math.max(1, party.remainingAttendance)}
                min={1}
                onChange={(event) =>
                  setAttendeeCount(
                    clamp(
                      Number.parseInt(event.currentTarget.value, 10),
                      party.remainingAttendance,
                    ),
                  )
                }
                type="number"
                value={attendeeCount}
              />
            </Field>
            <Button
              disabled={confirm.isPending || party.remainingAttendance === 0}
              loading={confirm.isPending}
              onClick={() => confirm.mutate()}
            >
              {confirm.isPending ? copy.confirming : copy.confirmAction}
            </Button>
            {confirm.isError ? (
              <Toast
                dismissLabel={common.close}
                kind="error"
                onDismiss={() => confirm.reset()}
                title={copy.checkInError}
              />
            ) : null}
          </div>
        ) : null}
      </Dialog>

      {notice ? (
        <Toast
          dismissLabel={common.close}
          kind={outcome?.outcome === "ALREADY_CHECKED_IN" ? "info" : "success"}
          onDismiss={() => {
            setNotice("");
            setOutcome(null);
          }}
          title={notice}
        />
      ) : null}
    </div>
  );
}

/**
 * Camera scanning stays optional: without a barcode reader the staff member
 * pastes the token printed under the QR code instead, and no attendance is
 * ever recorded without a confirmed server response.
 */
function useEntryPassCamera(onScan: (token: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "BarcodeDetector" in window &&
        typeof navigator.mediaDevices?.getUserMedia === "function",
    );
  }, []);

  const stop = () => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  };

  useEffect(() => stop, []);

  useEffect(() => {
    if (!active) return;
    const reader = createBarcodeReader();
    if (!reader) return;
    let cancelled = false;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      void reader
        .detect(video)
        .then((codes) => {
          const value = codes.at(0)?.rawValue;
          if (!value || cancelled) return;
          cancelled = true;
          onScan(value);
        })
        .catch(() => undefined);
    }, SCAN_INTERVAL_MILLISECONDS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, onScan]);

  const start = () => {
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
        setActive(true);
      })
      .catch(() => setSupported(false));
  };

  return { active, start, stop, supported, videoRef };
}

function createBarcodeReader(): BarcodeReader | null {
  const constructor = (
    window as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => BarcodeReader;
    }
  ).BarcodeDetector;
  if (!constructor) return null;
  try {
    return new constructor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function CheckInLoading({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="check-in-loading">
      <Skeleton height={72} />
      <Skeleton height={72} />
    </div>
  );
}

function checkInDisabledCode(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return null;
  return DISABLED_CODES.has(error.code) ? error.code : null;
}

function outcomeNotice(
  result: CheckInResult,
  copy: Dictionary["checkIn"],
): string {
  if (result.outcome === "ALREADY_CHECKED_IN") return copy.alreadyCheckedIn;
  return result.outcome === "CHECKED_IN"
    ? copy.completeSuccess
    : copy.partialSuccess;
}

function clamp(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.trunc(value), 1), Math.max(1, maximum));
}

function idempotencyKey(): string {
  return `check-in-${crypto.randomUUID()}`;
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
