import type { LedgerMode } from "./config";
import type {
  AcceptSubscriptionInput,
  AttestationSubmissionInput,
  LedgerSubmissionResult,
  SettlementEvent,
  SubscriptionRequestEvent,
  Unsubscribe,
  XauPricePublication,
} from "./types";

/**
 * The subset of ledger operations the off-ledger connectors depend on.
 * MockLedgerClient backs `ledger.mode: mock` (the default, and the only mode
 * unit tests use); JsonLedgerClient backs `ledger.mode: live` against
 * Canton's JSON Ledger API (config.ledger.jsonApiUrl). See createLedgerClient
 * for the mode-selection entrypoints use.
 */
export interface LedgerClient {
  /** Lightweight reachability check, used to gate LocalNet-only integration tests. */
  ping(): Promise<boolean>;

  /** Publishes an XAU price point (Oracle.PricePoint via OraclePublishAuthority.PublishPrice). */
  publishXauPrice(input: XauPricePublication): Promise<LedgerSubmissionResult>;

  /** Submits an Attestation (Attestations.Attestation via OperatorRole.SubmitAttestation). */
  submitAttestation(input: AttestationSubmissionInput): Promise<LedgerSubmissionResult>;

  /** Accepts an inbound subscription order, submitting the corresponding ledger command. */
  submitAcceptSubscription(input: AcceptSubscriptionInput): Promise<LedgerSubmissionResult>;

  /** Notifies the handler each time a SubscriptionRequest contract is created on the ledger. */
  onSubscriptionRequestCreated(handler: (event: SubscriptionRequestEvent) => void): Unsubscribe;

  /** Notifies the handler each time a subscription settles on the ledger. */
  onSettlement(handler: (event: SettlementEvent) => void): Unsubscribe;
}

/**
 * In-memory LedgerClient used by unit tests (and as the default wiring for
 * connectors run outside of a real LocalNet). Records every submission so
 * tests can assert on what was sent, and exposes emit* helpers so tests can
 * simulate ledger-originated events (contract creation, settlement).
 */
export class MockLedgerClient implements LedgerClient {
  readonly publishedPrices: XauPricePublication[] = [];
  readonly submittedAttestations: AttestationSubmissionInput[] = [];
  readonly acceptedSubscriptions: AcceptSubscriptionInput[] = [];

  private nextContractSeq = 1;
  private readonly subscriptionRequestHandlers = new Set<(event: SubscriptionRequestEvent) => void>();
  private readonly settlementHandlers = new Set<(event: SettlementEvent) => void>();

  async ping(): Promise<boolean> {
    return true;
  }

  async publishXauPrice(input: XauPricePublication): Promise<LedgerSubmissionResult> {
    this.publishedPrices.push(input);
    return { contractId: this.nextContractId("PricePoint") };
  }

  async submitAttestation(input: AttestationSubmissionInput): Promise<LedgerSubmissionResult> {
    this.submittedAttestations.push(input);
    return { contractId: this.nextContractId("Attestation") };
  }

  async submitAcceptSubscription(input: AcceptSubscriptionInput): Promise<LedgerSubmissionResult> {
    this.acceptedSubscriptions.push(input);
    return { contractId: this.nextContractId("SubscriptionRequest") };
  }

  onSubscriptionRequestCreated(handler: (event: SubscriptionRequestEvent) => void): Unsubscribe {
    this.subscriptionRequestHandlers.add(handler);
    return () => this.subscriptionRequestHandlers.delete(handler);
  }

  onSettlement(handler: (event: SettlementEvent) => void): Unsubscribe {
    this.settlementHandlers.add(handler);
    return () => this.settlementHandlers.delete(handler);
  }

  /** Test/demo helper: simulates the ledger creating a SubscriptionRequest contract. */
  emitSubscriptionRequest(event: SubscriptionRequestEvent): void {
    for (const handler of this.subscriptionRequestHandlers) handler(event);
  }

  /** Test/demo helper: simulates the ledger settling a subscription. */
  emitSettlement(event: SettlementEvent): void {
    for (const handler of this.settlementHandlers) handler(event);
  }

  private nextContractId(prefix: string): string {
    return `mock-${prefix}-${this.nextContractSeq++}`;
  }
}

export interface JsonLedgerClientOptions {
  jsonApiUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Thin real LedgerClient wired against Canton's JSON Ledger API v2.
 * `submitCommand` is fully implemented (POST {jsonApiUrl}/v2/commands/submit-and-wait,
 * matching the v2 JSON API "submit and wait" shape); the per-operation
 * template/choice command payloads and the event-subscription plumbing
 * (`onSubscriptionRequestCreated`/`onSettlement`, which need the Ledger API's
 * streaming/polling endpoints) are NOT implemented in this prototype, so
 * those methods throw a clear, explicit error instead of silently behaving
 * like the mock. Only instantiated when `ledger.mode: live` (see
 * createLedgerClient below) — unit tests exclusively use MockLedgerClient.
 */
export class JsonLedgerClient implements LedgerClient {
  private readonly jsonApiUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JsonLedgerClientOptions) {
    if (!options.jsonApiUrl || options.jsonApiUrl.trim().length === 0) {
      throw new Error("JsonLedgerClient requires a non-empty jsonApiUrl (config.ledger.jsonApiUrl)");
    }
    this.jsonApiUrl = options.jsonApiUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(this.jsonApiUrl);
      return res.status < 500;
    } catch {
      return false;
    }
  }

  /**
   * POSTs a Canton JSON Ledger API v2 submit-and-wait command body to
   * `{jsonApiUrl}/v2/commands/submit-and-wait` and returns the parsed JSON
   * response. Callers are responsible for shaping `commands` into the
   * expected create/exercise command payload.
   */
  async submitCommand(commands: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.fetchImpl(`${this.jsonApiUrl}/v2/commands/submit-and-wait`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(commands),
    });
    if (!res.ok) {
      throw new Error(`JsonLedgerClient: submit-and-wait failed with HTTP status ${res.status}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  async publishXauPrice(): Promise<LedgerSubmissionResult> {
    throw this.notImplemented("publishXauPrice");
  }

  async submitAttestation(): Promise<LedgerSubmissionResult> {
    throw this.notImplemented("submitAttestation");
  }

  async submitAcceptSubscription(): Promise<LedgerSubmissionResult> {
    throw this.notImplemented("submitAcceptSubscription");
  }

  onSubscriptionRequestCreated(): Unsubscribe {
    throw this.notImplemented("onSubscriptionRequestCreated");
  }

  onSettlement(): Unsubscribe {
    throw this.notImplemented("onSettlement");
  }

  private notImplemented(operation: string): Error {
    return new Error(
      `JsonLedgerClient.${operation}() is not fully wired against the Canton JSON Ledger API yet ` +
        `(submitCommand() POSTs to ${this.jsonApiUrl}/v2/commands/submit-and-wait, but the ` +
        `template/choice-specific command payload for "${operation}" still needs to be implemented; ` +
        `see connector/shared/src/ledgerClient.ts). Set connectors config ledger.mode: mock ` +
        `(config/localnet.yaml) for local/unit use in the meantime.`,
    );
  }
}

/**
 * Resolves the effective ledger mode: the `LEDGER_MODE` env var (if set to
 * "mock" or "live") takes precedence over `config.ledger.mode`, so operators
 * can force a mode without editing YAML.
 */
export function resolveLedgerMode(configMode: LedgerMode): LedgerMode {
  const envMode = process.env.LEDGER_MODE;
  if (envMode === "mock" || envMode === "live") {
    return envMode;
  }
  return configMode;
}

/**
 * Entrypoint-facing factory: every connector's src/index.ts main() should
 * build its LedgerClient through this function rather than constructing
 * MockLedgerClient directly, so `ledger.mode: live` (or `LEDGER_MODE=live`)
 * reliably switches to JsonLedgerClient instead of silently mocking.
 */
export function createLedgerClient(ledger: { mode: LedgerMode; jsonApiUrl: string }): LedgerClient {
  const mode = resolveLedgerMode(ledger.mode);
  if (mode === "live") {
    return new JsonLedgerClient({ jsonApiUrl: ledger.jsonApiUrl });
  }
  return new MockLedgerClient();
}
