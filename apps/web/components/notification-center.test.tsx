import "../test/setup";
import type { ListNotificationsResponse } from "@dawah/api-contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { NotificationCenter } from "./notification-center";

const eventId = "11111111-1111-4111-8111-111111111111";
const notificationId = "22222222-2222-4222-8222-222222222222";

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock("../lib/api", () => api);

const notifications: ListNotificationsResponse = {
  items: [
    {
      createdAt: "2026-09-13T08:00:00.000Z",
      data: { failedMessages: 1 },
      eventId,
      id: notificationId,
      kind: "MESSAGE_BATCH_FAILED",
      readAt: null,
      sourceId: "33333333-3333-4333-8333-333333333333",
      sourceType: "SendBatch",
    },
  ],
  pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1 },
  unreadCount: 1,
};

function renderNotifications() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationCenter
        common={en.common}
        copy={en.notifications}
        enabled
        eventId={eventId}
        locale="en"
        supabase={null}
      />
    </QueryClientProvider>,
  );
}

describe("notification center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listNotifications.mockResolvedValue(notifications);
    api.markNotificationRead.mockResolvedValue(undefined);
  });

  it("surfaces unread domain events and marks only the selected item read", async () => {
    const user = userEvent.setup();
    renderNotifications();

    const trigger = await screen.findByRole("button", {
      name: `${en.notifications.label} (1)`,
    });
    await user.click(trigger);
    expect(await screen.findByText(en.notifications.batchFailed)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: en.notifications.markRead }),
    );

    await waitFor(() =>
      expect(api.markNotificationRead).toHaveBeenCalledWith(
        null,
        notificationId,
      ),
    );
  });
});
