import { createServer, type ServerResponse } from "node:http";
import { validateWorkerEnvironment } from "@dawah/config";
import { defaultImportParserLimits } from "@dawah/imports";
import { MetaWhatsAppProvider } from "@dawah/messaging";
import {
  createProducerRedis,
  createWorkerRedis,
  defaultJobOptions,
  queueNames,
  whatsappMessageJobs,
  type WhatsappSendJobData,
  type WhatsappWebhookJobData,
} from "@dawah/queue";
import { createS3ObjectStorage } from "@dawah/storage";
import { PrismaClient } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import {
  createImportProcessor,
  type ImportProcessorResult,
  type ImportQueueJobData,
  type ImportQueueJobName,
} from "./import-processor";
import { PrismaImportProcessorRepository } from "./prisma-import-repository";
import { PrismaMessagingRepository } from "./prisma-messaging-repository";
import { createWhatsappSendProcessor } from "./whatsapp-send-processor";
import { createWhatsappWebhookProcessor } from "./whatsapp-webhook-processor";

const environment = validateWorkerEnvironment(process.env);
const redis = createWorkerRedis(environment.REDIS_URL, "dawah-worker");
const prisma = new PrismaClient({ datasourceUrl: environment.DATABASE_URL });
const producerRedis = createProducerRedis(
  environment.REDIS_URL,
  "dawah-worker-messaging-producer",
);
const storage = createS3ObjectStorage({
  endpoint: environment.STORAGE_ENDPOINT,
  region: environment.STORAGE_REGION,
  credentials: {
    accessKeyId: environment.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: environment.STORAGE_SECRET_ACCESS_KEY,
  },
  forcePathStyle: environment.STORAGE_FORCE_PATH_STYLE,
});
const healthWorker = new Worker(
  queueNames.health,
  async (job) => ({ jobId: job.id, checkedAt: new Date().toISOString() }),
  {
    concurrency: 1,
    connection: redis,
    prefix: environment.QUEUE_PREFIX,
  },
);
const importProcessor = createImportProcessor({
  limits: {
    ...defaultImportParserLimits,
    maximumFileBytes: environment.IMPORT_MAX_FILE_BYTES,
    maximumRows: environment.IMPORT_MAX_ROWS,
    maximumColumns: environment.IMPORT_MAX_COLUMNS,
    maximumCellCharacters: environment.IMPORT_MAX_CELL_CHARACTERS,
  },
  repository: new PrismaImportProcessorRepository(prisma),
  storage,
});
const importWorker = new Worker<
  ImportQueueJobData,
  ImportProcessorResult,
  ImportQueueJobName
>(queueNames.imports, importProcessor, {
  concurrency: 1,
  connection: redis,
  prefix: environment.QUEUE_PREFIX,
});
const messagingRepository = new PrismaMessagingRepository(prisma, {
  mediaPublicApiBaseUrl: environment.META_WHATSAPP_MEDIA_PUBLIC_BASE_URL,
  mediaSigningSecret: environment.META_WHATSAPP_MEDIA_SIGNING_SECRET,
  mediaUrlTtlSeconds: environment.META_WHATSAPP_MEDIA_URL_TTL_SECONDS,
});
const provider = new MetaWhatsAppProvider({
  accessToken: environment.META_WHATSAPP_ACCESS_TOKEN,
  phoneNumberId: environment.META_WHATSAPP_PHONE_NUMBER_ID,
  graphApiVersion: environment.META_WHATSAPP_GRAPH_API_VERSION,
  requestTimeoutMilliseconds: environment.META_WHATSAPP_REQUEST_TIMEOUT_MS,
});
const sendQueue = new Queue<WhatsappSendJobData>(queueNames.whatsappSend, {
  connection: producerRedis,
  prefix: environment.QUEUE_PREFIX,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: environment.META_WHATSAPP_MAX_ATTEMPTS,
  },
});
let whatsappSendWorker: Worker<WhatsappSendJobData>;
const sendProcessor = createWhatsappSendProcessor({
  repository: messagingRepository,
  provider,
  maximumAttempts: environment.META_WHATSAPP_MAX_ATTEMPTS,
  enqueueMessages: async (messageIds) => {
    if (messageIds.length === 0) return;
    await sendQueue.addBulk(
      whatsappMessageJobs(messageIds, environment.META_WHATSAPP_MAX_ATTEMPTS),
    );
  },
  rateLimit: (milliseconds) => whatsappSendWorker.rateLimit(milliseconds),
  rateLimitError: () => Worker.RateLimitError(),
});
whatsappSendWorker = new Worker<WhatsappSendJobData>(
  queueNames.whatsappSend,
  sendProcessor,
  {
    concurrency: environment.META_WHATSAPP_SEND_CONCURRENCY,
    limiter: {
      max: environment.META_WHATSAPP_MAX_SENDS_PER_SECOND,
      duration: 1_000,
    },
    connection: redis,
    prefix: environment.QUEUE_PREFIX,
  },
);
const whatsappWebhookWorker = new Worker<WhatsappWebhookJobData>(
  queueNames.whatsappWebhook,
  createWhatsappWebhookProcessor(messagingRepository),
  {
    concurrency: Math.min(environment.META_WHATSAPP_SEND_CONCURRENCY * 2, 16),
    connection: redis,
    prefix: environment.QUEUE_PREFIX,
  },
);

healthWorker.on("error", (error) => {
  console.error("Health worker queue connection error:", error.message);
});
importWorker.on("error", (error) => {
  console.error("Import worker queue connection error:", error.message);
});
whatsappSendWorker.on("error", (error) => {
  console.error("WhatsApp send worker queue connection error:", error.message);
});
whatsappSendWorker.on("failed", (job) => {
  if (!job) return;
  const maximumAttempts =
    typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  if (job.attemptsMade < maximumAttempts) return;
  const exhaustedAt = new Date(job.finishedOn ?? Date.now());
  void messagingRepository
    .recordExhaustedSendJob(job.data, exhaustedAt)
    .catch(() => {
      console.error(
        `WhatsApp exhausted-job persistence failed for job ${job.id ?? "unknown"}.`,
      );
    });
});
whatsappWebhookWorker.on("error", (error) => {
  console.error(
    "WhatsApp webhook worker queue connection error:",
    error.message,
  );
});

const server = createServer(async (request, response) => {
  applySecurityHeaders(response);

  if (request.method !== "GET") {
    respond(response, 405, { error: "method_not_allowed" });
    return;
  }

  if (request.url === "/health/live") {
    respond(response, 200, { status: "ok" });
    return;
  }

  if (request.url === "/health/ready") {
    const [
      redisReady,
      databaseReady,
      healthWorkerReady,
      importWorkerReady,
      whatsappSendWorkerReady,
      whatsappWebhookWorkerReady,
    ] = await Promise.all([
      resolvesWithin(
        redis.ping().then((result) => result === "PONG"),
        environment.WORKER_READY_TIMEOUT_MS,
      ),
      resolvesWithin(
        prisma.$queryRaw`SELECT 1`.then(() => true),
        environment.WORKER_READY_TIMEOUT_MS,
      ),
      resolvesWithin(
        healthWorker.waitUntilReady().then(() => healthWorker.isRunning()),
        environment.WORKER_READY_TIMEOUT_MS,
      ),
      resolvesWithin(
        importWorker.waitUntilReady().then(() => importWorker.isRunning()),
        environment.WORKER_READY_TIMEOUT_MS,
      ),
      resolvesWithin(
        whatsappSendWorker
          .waitUntilReady()
          .then(() => whatsappSendWorker.isRunning()),
        environment.WORKER_READY_TIMEOUT_MS,
      ),
      resolvesWithin(
        whatsappWebhookWorker
          .waitUntilReady()
          .then(() => whatsappWebhookWorker.isRunning()),
        environment.WORKER_READY_TIMEOUT_MS,
      ),
    ]);
    const ready =
      redisReady &&
      databaseReady &&
      healthWorkerReady &&
      importWorkerReady &&
      whatsappSendWorkerReady &&
      whatsappWebhookWorkerReady;
    respond(
      response,
      ready ? 200 : 503,
      ready
        ? {
            status: "ok",
            checks: {
              redis: "ok",
              database: "ok",
              healthWorker: "ok",
              importWorker: "ok",
              whatsappSendWorker: "ok",
              whatsappWebhookWorker: "ok",
            },
          }
        : {
            status: "error",
            checks: {
              redis: redisReady ? "ok" : "error",
              database: databaseReady ? "ok" : "error",
              healthWorker: healthWorkerReady ? "ok" : "error",
              importWorker: importWorkerReady ? "ok" : "error",
              whatsappSendWorker: whatsappSendWorkerReady ? "ok" : "error",
              whatsappWebhookWorker: whatsappWebhookWorkerReady
                ? "ok"
                : "error",
            },
          },
    );
    return;
  }

  respond(response, 404, { error: "not_found" });
});

server.listen(environment.WORKER_PORT, "0.0.0.0", () => {
  console.info(
    `Dawah worker health server listening on ${environment.WORKER_PORT}.`,
  );
});

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Dawah worker received ${signal}; shutting down.`);

  server.closeIdleConnections();
  const graceful = Promise.allSettled([
    new Promise<void>((resolve) => server.close(() => resolve())),
    healthWorker.close(),
    importWorker.close(),
    whatsappSendWorker.close(),
    whatsappWebhookWorker.close(),
    sendQueue.close(),
    prisma.$disconnect(),
    redis.quit(),
    producerRedis.quit(),
  ]).then(() => true);
  const finished = await resolvesWithin(graceful, 10_000);
  if (!finished) {
    server.closeAllConnections();
    await Promise.allSettled([
      healthWorker.close(true),
      importWorker.close(true),
      whatsappSendWorker.close(true),
      whatsappWebhookWorker.close(true),
      sendQueue.close(),
    ]);
    await prisma.$disconnect().catch(() => undefined);
    redis.disconnect(false);
    producerRedis.disconnect(false);
  }
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).catch((error: unknown) => {
      console.error(
        "Worker shutdown failed:",
        error instanceof Error ? error.message : "unknown error",
      );
      process.exitCode = 1;
    });
  });
}

function respond(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

async function resolvesWithin(
  promise: Promise<boolean>,
  timeoutMilliseconds: number,
): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise.catch(() => false),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMilliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
