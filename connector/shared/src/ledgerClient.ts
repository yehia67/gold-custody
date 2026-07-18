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
 * A production implementation would submit these against Canton's JSON
 * Ledger API (config.ledger.jsonApiUrl); for this prototype only
 * MockLedgerClient exists, and every service depends on this interface so a
 * real implementation can be swapped in later without touching business
 * logic.
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
