import { once } from "node:events";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProducerRedis,
  defaultJobOptions,
  exportJobId,
  probeRedis,
  producerReconnectDelay,
  reminderRunJobId,
  reminderRunJobs,
  reminderSweepJobData,
  reminderSweepSchedulerId,
  whatsappBatchJobId,
  whatsappMessageJobId,
  whatsappMessageJobs,
  whatsappRsvpConfirmationJobId,
  whatsappRsvpConfirmationJobs,
  whatsappWebhookJobId,
} from "./index";

describe("export queue identifiers", () => {
  it("creates a deterministic PII-free export job identifier", () => {
    expect(exportJobId("job-id")).toBe("export-job-id");
  });
});

describe("reminder queue identifiers", () => {
  it("creates stable PII-free sweep and rule-run definitions", () => {
    expect(reminderSweepSchedulerId).toBe("automatic-reminder-sweep");
    expect(reminderSweepJobData()).toEqual({ operation: "SWEEP" });
    expect(reminderRunJobId("rule-id", "a".repeat(64))).toBe(
      `reminder-run-rule-id-${"a".repeat(64)}`,
    );
  });

  it("builds deterministic bounded rule jobs", () => {
    const run = {
      eventId: "event-id",
      ruleId: "rule-id",
      scheduleKey: "b".repeat(64),
      scheduledFor: "2026-09-12T12:00:00.000Z",
    };
    expect(reminderRunJobs([run])).toEqual([
      {
        name: "run",
        data: { operation: "RUN", ...run },
        opts: {
          jobId: `reminder-run-rule-id-${"b".repeat(64)}`,
          ...defaultJobOptions,
        },
      },
    ]);
  });
});

describe("WhatsApp queue identifiers", () => {
  it("creates deterministic PII-free job identifiers", () => {
    expect(whatsappBatchJobId("batch-id")).toBe("batch-batch-id");
    expect(whatsappMessageJobId("message-id")).toBe("message-message-id");
    expect(whatsappWebhookJobId("event-id")).toBe("webhook-event-id");
    expect(whatsappRsvpConfirmationJobId("confirmation-id")).toBe(
      "rsvp-confirmation-confirmation-id",
    );
  });

  it("builds deterministic bounded message jobs", () => {
    expect(whatsappMessageJobs(["message-a"], 5)).toEqual([
      {
        name: "send",
        data: { operation: "SEND_MESSAGE", messageId: "message-a" },
        opts: {
          jobId: "message-message-a",
          attempts: 5,
          backoff: defaultJobOptions.backoff,
        },
      },
    ]);
  });

  it("builds deterministic bounded RSVP confirmation jobs", () => {
    expect(whatsappRsvpConfirmationJobs(["confirmation-a"], 4)).toEqual([
      {
        name: "send-rsvp-confirmation",
        data: {
          operation: "SEND_RSVP_CONFIRMATION",
          confirmationId: "confirmation-a",
        },
        opts: {
          jobId: "rsvp-confirmation-confirmation-a",
          attempts: 4,
          backoff: defaultJobOptions.backoff,
        },
      },
    ]);
  });
});

describe("Redis connections", () => {
  let server: FakeRedisServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("reconnects a producer after the server drops the connection", async () => {
    server = await startFakeRedis();
    const client = createProducerRedis(server.url, "dawah-test-producer");
    try {
      await client.connect();
      await expect(client.ping()).resolves.toBe("PONG");

      const reconnected = once(client, "ready");
      server.dropConnections();
      await reconnected;

      await expect(client.ping()).resolves.toBe("PONG");
    } finally {
      client.disconnect(false);
    }
  });

  it("backs off between producer reconnects without ever giving up", () => {
    expect(producerReconnectDelay(1)).toBe(500);
    expect(producerReconnectDelay(4)).toBe(2_000);
    expect(producerReconnectDelay(1_000)).toBe(5_000);
  });

  it("reports readiness from a one-shot probe", async () => {
    server = await startFakeRedis();
    await expect(probeRedis(server.url, 2_000)).resolves.toBe(true);

    const url = server.url;
    await server.close();
    server = undefined;
    await expect(probeRedis(url, 2_000)).resolves.toBe(false);
  });
});

interface FakeRedisServer {
  url: string;
  dropConnections(): void;
  close(): Promise<void>;
}

/** Just enough RESP for ioredis to connect, run its ready check, and PING. */
async function startFakeRedis(): Promise<FakeRedisServer> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    let buffered = "";
    socket.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      for (;;) {
        const parsed = parseRespCommand(buffered);
        if (!parsed) return;
        buffered = buffered.slice(parsed.length);
        const name = parsed.command[0]?.toUpperCase();
        if (name === "PING") socket.write("+PONG\r\n");
        else if (name === "INFO") socket.write("$0\r\n\r\n");
        else socket.write("+OK\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `redis://127.0.0.1:${port}`,
    dropConnections: () => {
      for (const socket of sockets) socket.destroy();
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

function parseRespCommand(
  input: string,
): { command: string[]; length: number } | null {
  const header = /^\*(\d+)\r\n/.exec(input);
  if (!header) return null;
  let offset = header[0].length;
  const command: string[] = [];
  for (let index = 0; index < Number(header[1]); index += 1) {
    const bulk = /^\$(\d+)\r\n/.exec(input.slice(offset));
    if (!bulk) return null;
    const start = offset + bulk[0].length;
    const end = start + Number(bulk[1]);
    if (input.length < end + 2) return null;
    command.push(input.slice(start, end));
    offset = end + 2;
  }
  return { command, length: offset };
}
