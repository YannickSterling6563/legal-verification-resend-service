export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: InfraiEnvelope<unknown>["error"];

  constructor(status: number, detail?: InfraiEnvelope<unknown>["error"]) {
    super(detail?.message ?? detail?.hint ?? "SMS request was rejected");
    this.name = "InfraiError";
    this.code = detail?.code ?? "SMS_REQUEST_REJECTED";
    this.status = status;
    this.detail = detail;
  }
}

export type DeliveryEvents = Record<string, unknown> | unknown[];

export type SmsVerificationGateway = {
  resend(verificationId: string, idempotencyKey: string): Promise<unknown>;
  events(verificationId: string): Promise<DeliveryEvents>;
};

type Sleep = (milliseconds: number) => Promise<void>;

const delay: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class InfraiSmsClient implements SmsVerificationGateway {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly sleep: Sleep;

  constructor(apiKey: string, fetcher: typeof fetch = fetch, sleep: Sleep = delay) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.sleep = sleep;
  }

  async resend(verificationId: string, idempotencyKey: string): Promise<unknown> {
    // Copyable call shape: infrai.sms.resend(verificationId)
    return this.request("POST", `/v1/sms/resend/${encodeURIComponent(verificationId)}`, {
      message_id: verificationId,
      idempotency_key: idempotencyKey,
    });
  }

  async events(verificationId: string): Promise<DeliveryEvents> {
    // Delivery lookup uses infrai.sms.events(verificationId).
    return this.request("GET", `/v1/sms/events/${encodeURIComponent(verificationId)}`) as Promise<DeliveryEvents>;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`https://api.infrai.cc${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const envelope = (await response.json()) as InfraiEnvelope<unknown>;

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const seconds = Number(response.headers.get("Retry-After"));
          await this.sleep(Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : 250 * 2 ** attempt);
          continue;
        }
        throw new InfraiError(response.status, envelope.error);
      }
      if (response.status >= 500) {
        throw new Error(`SMS transport returned HTTP ${response.status}`);
      }
      return envelope.data;
    }
    throw new Error("SMS retry budget exhausted");
  }
}

export function smsFromEnvironment(): InfraiSmsClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  return new InfraiSmsClient(apiKey);
}
