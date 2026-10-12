import { classifyMessagingRetry } from "@dawah/domain";
import {
  MessagingProviderError,
  type MessagingProvider,
  type MessagingTemplateSendInput,
  type ProviderMessageResult,
} from "./types";

export const DIALOG360_DEFAULT_API_BASE_URL = "https://waba-v2.360dialog.io";

export interface Dialog360WhatsAppProviderOptions {
  /** Channel API key. It is scoped to one phone number, so no number ID is sent. */
  readonly apiKey: string;
  readonly apiBaseUrl?: string;
  readonly requestTimeoutMilliseconds?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
}

/**
 * 360dialog relays Meta's error body unchanged, so Meta's codes still drive
 * retry classification. Its own rejections (an unknown API key, a blocked
 * channel) carry no Meta code and fall through to the HTTP status.
 */
interface CloudApiErrorBody {
  readonly error?: {
    readonly code?: unknown;
    readonly error_subcode?: unknown;
  };
}

/**
 * Sends approved templates through 360dialog's hosted WhatsApp Cloud API.
 * The request body is the Cloud API payload Meta defines; 360dialog only
 * changes the host and the credential.
 */
export class Dialog360WhatsAppProvider implements MessagingProvider {
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMilliseconds: number;
  private readonly baseUrl: string;
  private readonly now: () => Date;

  public constructor(
    private readonly options: Dialog360WhatsAppProviderOptions,
  ) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMilliseconds = options.requestTimeoutMilliseconds ?? 10_000;
    this.baseUrl = (
      options.apiBaseUrl ?? DIALOG360_DEFAULT_API_BASE_URL
    ).replace(/\/+$/, "");
    this.now = options.now ?? (() => new Date());
  }

  public sendInvitation(
    input: MessagingTemplateSendInput,
  ): Promise<ProviderMessageResult> {
    return this.sendTemplate(input);
  }

  public sendReminder(
    input: MessagingTemplateSendInput,
  ): Promise<ProviderMessageResult> {
    return this.sendTemplate(input);
  }

  public sendConfirmation(
    input: MessagingTemplateSendInput,
  ): Promise<ProviderMessageResult> {
    return this.sendTemplate(input);
  }

  private async sendTemplate(
    input: MessagingTemplateSendInput,
  ): Promise<ProviderMessageResult> {
    if ((input.quickReplyPayloads?.length ?? 0) > 3) {
      throw new MessagingProviderError("PROVIDER_TEMPLATE_BUTTON_LIMIT", {
        failureClass: "PERMANENT",
        retryable: false,
      });
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMilliseconds,
    );
    let response: Response;
    let body: unknown;
    try {
      response = await this.fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "D360-API-KEY": this.options.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.payload(input)),
        signal: controller.signal,
      });
      body = await readJson(response);
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw new MessagingProviderError(
        timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR",
        classifyMessagingRetry({ timedOut, networkError: !timedOut }),
        undefined,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const providerError = providerErrorIdentity(body);
      throw new MessagingProviderError(
        providerError.displayCode,
        classifyMessagingRetry({
          httpStatus: response.status,
          providerCode: providerError.displayCode,
          providerCodes: providerError.codes,
          retryAfterMilliseconds: parseRetryAfter(
            response.headers.get("retry-after"),
            this.now(),
          ),
        }),
        response.status,
      );
    }

    const providerMessageId = firstProviderMessageId(body);
    if (!providerMessageId) {
      throw new MessagingProviderError(
        "PROVIDER_RESPONSE_INVALID",
        { failureClass: "AMBIGUOUS", retryable: false },
        response.status,
      );
    }
    return {
      provider: "META_WHATSAPP",
      providerMessageId,
      acceptedAt: this.now(),
    };
  }

  private payload(input: MessagingTemplateSendInput): Record<string, unknown> {
    const components: Array<Record<string, unknown>> = [];
    if (input.header) {
      components.push({
        type: "header",
        parameters: [
          {
            type: "image",
            image:
              input.header.kind === "IMAGE_ID"
                ? { id: input.header.mediaId }
                : { link: input.header.url },
          },
        ],
      });
    }
    if (input.bodyParameters.length > 0) {
      components.push({
        type: "body",
        parameters: input.bodyParameters.map((value) => ({
          type: "text",
          text: value,
        })),
      });
    }
    for (const [index, payload] of (input.quickReplyPayloads ?? []).entries()) {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(index),
        parameters: [{ type: "payload", payload }],
      });
    }

    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to.replace(/^\+/, ""),
      type: "template",
      biz_opaque_callback_data: input.logicalMessageId,
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        ...(components.length === 0 ? {} : { components }),
      },
    };
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function providerErrorIdentity(body: unknown): {
  readonly displayCode: string;
  readonly codes: readonly string[];
} {
  if (typeof body !== "object" || body === null) {
    return { displayCode: "PROVIDER_HTTP_ERROR", codes: [] };
  }
  const error = (body as CloudApiErrorBody).error;
  const code = typeof error?.code === "number" ? String(error.code) : undefined;
  const subcode =
    typeof error?.error_subcode === "number"
      ? String(error.error_subcode)
      : undefined;
  const codes = [...new Set([code, subcode].filter(isString))];
  return {
    displayCode: codes.length === 0 ? "PROVIDER_HTTP_ERROR" : codes.join("/"),
    codes,
  };
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}

function firstProviderMessageId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const messages = (body as { readonly messages?: unknown }).messages;
  if (!Array.isArray(messages)) return undefined;
  const first = messages[0];
  if (typeof first !== "object" || first === null) return undefined;
  const id = (first as { readonly id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function parseRetryAfter(value: string | null, now: Date): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1_000;
  const retryDate = Date.parse(value);
  if (!Number.isFinite(retryDate)) return undefined;
  return Math.max(retryDate - now.getTime(), 0) || undefined;
}
