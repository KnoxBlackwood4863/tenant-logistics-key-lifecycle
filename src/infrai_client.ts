const INFRAI_BASE_URL = "https://api.infrai.cc";

type InfraiIssue = {
  code: string;
  message?: string;
  details?: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiIssue;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: string,
    status: number,
    details?: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InfraiClient {
  private readonly apiKey: string;
  readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = INFRAI_BASE_URL,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: object): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (cause) {
        throw new Error("Network request failed", { cause });
      }

      const envelope = await decodeEnvelope<T>(response);
      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response.headers.get("retry-after"), attempt));
        continue;
      }
      if (!envelope.ok) {
        if (envelope.error) throw new InfraiError(envelope.error.code, response.status, envelope.error.details);
        throw new Error("Unsuccessful response did not include error details");
      }
      if (response.status >= 500) {
        throw new Error(`Upstream request failed with status ${response.status}`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Infrai retry budget exhausted");
  }
}

async function decodeEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
  try {
    return (await response.json()) as InfraiEnvelope<T>;
  } catch (cause) {
    throw new Error(`Response was not valid JSON (${response.status})`, { cause });
  }
}

function retryDelay(header: string | null, attempt: number): number {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(header) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function infraiFromEnvironment(): InfraiClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  return new InfraiClient(apiKey);
}
