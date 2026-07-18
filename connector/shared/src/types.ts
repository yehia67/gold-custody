/** Attestation kinds mirrored from daml/Attestations.daml's AttestationKind. */
export type AttestationKind =
  | "Presence"
  | "Weight"
  | "Purity"
  | "Movement"
  | "AuditResult"
  | "InsuranceStatus";

export const ATTESTATION_KINDS: readonly AttestationKind[] = [
  "Presence",
  "Weight",
  "Purity",
  "Movement",
  "AuditResult",
  "InsuranceStatus",
];

/** Mirrors Oracle.daml's PriceSource: a named source plus a content hash. */
export interface PriceSourceRef {
  name: string;
  hash?: string;
}

export interface XauPricePublication {
  value: number;
  sources: PriceSourceRef[];
  sourceValues: Record<string, number>;
}

export interface AttestationSubmissionInput {
  kind: AttestationKind;
  barSerial: string;
  operatorId: string;
  evidenceHash: string;
  deviceId?: string;
  coSignedEvidenceHash?: string;
  coSignedOperatorId?: string;
}

export interface SubscriptionRequestEvent {
  contractId: string;
  investorParty: string;
  fundId: string;
  amount: string;
  currency: string;
  requestedAt: string;
}

export interface AcceptSubscriptionInput {
  subscriptionRequestContractId: string;
  investorParty: string;
  fundId: string;
  amount: string;
  currency: string;
}

export interface SettlementEvent {
  contractId: string;
  subscriptionRequestContractId: string;
  fundId: string;
  investorParty: string;
  unitsIssued: string;
  settledAt: string;
}

export interface LedgerSubmissionResult {
  contractId: string;
}

export type Unsubscribe = () => void;
