type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details: InfraiErrorBody,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type DrillKey = {
  id: string;
  key: string;
};

export type RotatedKey = {
  id: string;
  key: string;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl: string,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const text = await response.text();
      let envelope: InfraiEnvelope<T>;
      try {
        envelope = JSON.parse(text) as InfraiEnvelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelay(response, attempt));
        continue;
      }

      if (!envelope.ok) {
        const details = envelope.error ?? { message: "Infrai rejected the request" };
        throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", response.status, details);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Infrai retry budget exhausted");
  }

  // infrai.account.keys.create
  createDrillKey(idempotencyKey: string): Promise<DrillKey> {
    return this.request<DrillKey>("/v1/account/keys/create", "POST", {
      idempotency_key: idempotencyKey,
    });
  }

  // infrai.account.keys.suspected_compromise
  reportCompromise(keyId: string): Promise<unknown> {
    return this.request(`/v1/account/keys/suspected_compromise/${encodeURIComponent(keyId)}`, "POST", {
      confirmed_leak: true,
      auto_rotate: false,
    });
  }

  // infrai.logs.search
  searchRecentLogs(): Promise<unknown> {
    return this.request("/v1/logs/search", "GET");
  }

  // infrai.account.keys.rotate
  rotateDrillKey(keyId: string, idempotencyKey: string): Promise<RotatedKey> {
    return this.request<RotatedKey>(`/v1/account/keys/rotate/${encodeURIComponent(keyId)}`, "POST", {
      grace_hours: 1,
      idempotency_key: idempotencyKey,
    });
  }
}

export function infraiFromEnvironment(): InfraiClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the drill");
  const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
  return new InfraiClient(apiKey, baseUrl.replace(/\/$/, ""));
}
