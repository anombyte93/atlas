/**
 * Lightweight HTTP client for the Atlas Coin REST API.
 *
 * Defaults to http://localhost:3000 and uses the built-in fetch API.
 */
export interface AtlasCoinClientOptions {
  baseUrl?: string;
  token?: string;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export interface RequestOptions {
  idempotencyKey?: string;
  token?: string;
}

export interface BountyEvidence {
  ci_passed: boolean;
  coverage_percent: number;
  test_results?: string;
}

export interface BountySubmission {
  claimant: string;
  stakeAmount: number;
  evidence: BountyEvidence;
}

export interface VerificationResult {
  passed: boolean;
  reason: string;
  timestamp: number;
}

export interface Bounty {
  id: string;
  status: string;
  verified: boolean;
  claimant: string;
  escrowAmount: number;
}

export class AtlasCoinError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "AtlasCoinError";
    this.status = status;
    this.details = details;
  }
}

export class AtlasCoinClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(options: AtlasCoinClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://localhost:3000";
    this.token = options.token;
    this.retries = options.retries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async submitBounty(
    bountyId: string,
    submission: BountySubmission,
    options: RequestOptions = {}
  ): Promise<Bounty> {
    return this.request<Bounty>(`/api/bounties/${encodeURIComponent(bountyId)}/submit`, {
      method: "POST",
      body: JSON.stringify(submission),
      ...options,
    });
  }

  async verifyBounty(
    bountyId: string,
    evidence: BountyEvidence,
    options: RequestOptions = {}
  ): Promise<VerificationResult> {
    return this.request<VerificationResult>(`/api/bounties/${encodeURIComponent(bountyId)}/verify`, {
      method: "POST",
      body: JSON.stringify(evidence),
      ...options,
    });
  }

  async getBounty(bountyId: string, options: RequestOptions = {}): Promise<Bounty> {
    return this.request<Bounty>(`/api/bounties/${encodeURIComponent(bountyId)}`, {
      method: "GET",
      ...options,
    });
  }

  async listBounties(status?: string, options: RequestOptions = {}): Promise<Bounty[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.request<Bounty[]>(`/api/bounties${query}`, {
      method: "GET",
      ...options,
    });
  }

  async settleBounty(bountyId: string, options: RequestOptions = {}): Promise<Bounty> {
    return this.request<Bounty>(`/api/bounties/${encodeURIComponent(bountyId)}/settle`, {
      method: "POST",
      ...options,
    });
  }

  private async request<T>(
    path: string,
    init: RequestInit & RequestOptions
  ): Promise<T> {
    const url = this.composeUrl(path);
    const headers = this.buildHeaders(init.idempotencyKey, init.token);

    const response = await this.fetchWithRetry(url, {
      ...init,
      headers,
      signal: this.createAbortSignal(),
    });

    if (!response.ok) {
      const errorPayload = await this.safeParseJson(response);
      const message = this.buildErrorMessage(response, errorPayload);
      throw new AtlasCoinError(message, response.status, errorPayload);
    }

    return this.parseJson<T>(response);
  }

  private buildHeaders(idempotencyKey?: string, tokenOverride?: string): HeadersInit {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const bearer = tokenOverride ?? this.token;
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`;
    }

    // Attach Content-Type only when a body is present (POST calls set it, GET does not need it).
    return headers;
  }

  private composeUrl(path: string): string {
    if (path.startsWith("http")) return path;
    return `${this.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  private createAbortSignal(): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), this.timeoutMs);
    return controller.signal;
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.retries) {
      try {
        const response = await fetch(url, this.addContentType(init));
        if (response.ok || !this.shouldRetry(response.status)) {
          return response;
        }

        lastError = new AtlasCoinError(
          `Request failed with status ${response.status}`,
          response.status
        );
      } catch (error) {
        lastError = error;
        // Only retry on network/abort errors; status-based retries handled above.
      }

      attempt += 1;
      if (attempt > this.retries) break;
      await this.delay(this.backoffMs(attempt));
    }

    throw lastError instanceof Error
      ? lastError
      : new AtlasCoinError("Atlas Coin request failed after retries");
  }

  private addContentType(init: RequestInit): RequestInit {
    const hasBody = typeof init.body !== "undefined" && init.method !== "GET";
    if (!hasBody) return init;

    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return { ...init, headers };
  }

  private shouldRetry(status: number): boolean {
    return status === 408 || status === 429 || (status >= 500 && status < 600);
  }

  private backoffMs(attempt: number): number {
    return this.retryDelayMs * Math.pow(2, attempt - 1);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async parseJson<T>(response: Response): Promise<T> {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new AtlasCoinError("Expected JSON response", response.status);
    }
    return (await response.json()) as T;
  }

  private async safeParseJson(response: Response): Promise<unknown> {
    try {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return await response.json();
      }
      return await response.text();
    } catch (error) {
      return { parseError: String(error) };
    }
  }

  private buildErrorMessage(response: Response, details: unknown): string {
    const base = `Atlas Coin API responded with ${response.status} ${response.statusText}`;
    if (!details) return base;
    if (typeof details === "string") return `${base}: ${details}`;
    if (typeof details === "object") return `${base}: ${JSON.stringify(details)}`;
    return base;
  }
}
