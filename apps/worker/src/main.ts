import { createServer, type ServerResponse } from "node:http";
import { validateWorkerEnvironment } from "@dawah/config";
import { createWorkerRedis, queueNames } from "@dawah/queue";
import { Worker } from "bullmq";

const environment = validateWorkerEnvironment(process.env);
const redis = createWorkerRedis(environment.REDIS_URL, "dawah-worker");
const worker = new Worker(
  queueNames.health,
  async (job) => ({ jobId: job.id, checkedAt: new Date().toISOString() }),
  {
    concurrency: 1,
    connection: redis,
    prefix: environment.QUEUE_PREFIX,
  },
);

worker.on("error", (error) => {
  console.error("Worker queue connection error:", error.message);
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
    const [redisReady, workerReady] = await Promise.all([
      resolvesWithin(
        redis.ping().then((result) => result === "PONG"),
        environment.WORKER_READY_TIMEOUT_MS,
      ),
      resolvesWithin(
        worker.waitUntilReady().then(() => worker.isRunning()),
        environment.WORKER_READY_TIMEOUT_MS,
      ),
    ]);
    const ready = redisReady && workerReady;
    respond(
      response,
      ready ? 200 : 503,
      ready
        ? { status: "ok", checks: { redis: "ok", worker: "ok" } }
        : {
            status: "error",
            checks: {
              redis: redisReady ? "ok" : "error",
              worker: workerReady ? "ok" : "error",
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
    worker.close(),
    redis.quit(),
  ]).then(() => true);
  const finished = await resolvesWithin(graceful, 10_000);
  if (!finished) {
    server.closeAllConnections();
    await worker.close(true).catch(() => undefined);
    redis.disconnect(false);
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
