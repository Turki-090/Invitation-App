"use client";

import type { Notification } from "@dawah/api-contract";
import { Banner, Button, Dialog, EmptyState, IconButton } from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import { listNotifications, markNotificationRead } from "../lib/api";
import type { getSupabaseClient } from "../lib/supabase";

interface NotificationCenterProps {
  common: Dictionary["common"];
  copy: Dictionary["notifications"];
  enabled: boolean;
  eventId?: string;
  locale: AppLocale;
  supabase: ReturnType<typeof getSupabaseClient>;
}

export function NotificationCenter({
  common,
  copy,
  enabled,
  eventId,
  locale,
  supabase,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ["notifications", eventId ?? "all"] as const;
  const notifications = useQuery({
    enabled,
    queryFn: () =>
      listNotifications(supabase, {
        eventId,
        page: 1,
        pageSize: 12,
        unreadOnly: false,
      }),
    queryKey,
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationRead(supabase, notificationId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey }),
  });
  const unreadCount = notifications.data?.unreadCount ?? 0;

  return (
    <>
      <span className="notification-center__trigger">
        <IconButton
          label={
            unreadCount
              ? `${copy.label} (${formatNumber(unreadCount, locale)})`
              : copy.label
          }
          name="bell"
          onClick={() => {
            setOpen(true);
            void notifications.refetch();
          }}
          variant="outline"
        />
        {unreadCount ? (
          <span aria-hidden="true" className="notification-center__badge num">
            {formatNumber(unreadCount, locale)}
          </span>
        ) : null}
      </span>

      <Dialog
        closeLabel={common.close}
        footer={
          <Button onClick={() => setOpen(false)} variant="secondary">
            {common.close}
          </Button>
        }
        onClose={() => setOpen(false)}
        open={open}
        title={copy.title}
      >
        {notifications.isLoading ? (
          <div
            aria-busy="true"
            aria-label={copy.loading}
            className="notification-center__loading"
            role="status"
          >
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
        ) : notifications.isError ? (
          <Banner
            actionLabel={common.retry}
            kind="warning"
            onAction={() => notifications.refetch()}
            title={copy.loadError}
          />
        ) : notifications.data?.items.length ? (
          <div className="notification-center__list">
            {notifications.data.items.map((notification) => (
              <article
                className="notification-center__item"
                data-unread={!notification.readAt || undefined}
                key={notification.id}
              >
                <span aria-hidden="true" className="notification-center__dot" />
                <div>
                  <strong>{notificationLabel(notification, copy)}</strong>
                  <time dateTime={notification.createdAt}>
                    {formatDateTime(notification.createdAt, locale)}
                  </time>
                </div>
                {!notification.readAt ? (
                  <Button
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(notification.id)}
                    size="sm"
                    variant="ghost"
                  >
                    {copy.markRead}
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState description={copy.empty} icon="bell" title={copy.empty} />
        )}
      </Dialog>
    </>
  );
}

function notificationLabel(
  notification: Notification,
  copy: Dictionary["notifications"],
): string {
  return {
    MESSAGE_BATCH_COMPLETED: copy.batchCompleted,
    MESSAGE_BATCH_FAILED: copy.batchFailed,
    REMINDER_BATCH_COMPLETED: copy.reminderCompleted,
    TEAM_MEMBER_JOINED: copy.memberJoined,
  }[notification.kind];
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
