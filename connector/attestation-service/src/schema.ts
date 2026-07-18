import { ATTESTATION_KINDS, type AttestationKind, type PartiesConfig } from "@gold-custody/shared";

export type AttestationValidationErrorCode =
  | "SCHEMA_VIOLATION"
  | "MISSING_EVIDENCE"
  | "UNKNOWN_OPERATOR";

export class AttestationValidationError extends Error {
  readonly code: AttestationValidationErrorCode;

  constructor(code: AttestationValidationErrorCode, message: string) {
    super(message);
    this.name = "AttestationValidationError";
    this.code = code;
  }
}

/** Raw shape accepted on the wire: POST /attestations body. */
export interface AttestationSubmissionPayload {
  kind: AttestationKind;
  barSerial: string;
  operatorId: string;
  /** Base64-encoded evidence artifact bytes. */
  evidence: string;
  /** Present when the submitting operator is a device rather than a human. */
  deviceId?: string;
}

/**
 * Maps each attestation kind to the operator party ids permitted to submit
 * it. Built from config.parties at construction time, never from hardcoded
 * party id literals.
 */
export function allowedOperatorsByKind(parties: PartiesConfig): Record<AttestationKind, string[]> {
  return {
    Presence: [parties.vaultKeeper],
    Weight: [parties.weighmaster, parties.weighDevice],
    Purity: [parties.assayer],
    Movement: [parties.transporter],
    AuditResult: [parties.auditor],
    InsuranceStatus: [parties.complianceProvider],
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Validates the raw JSON body of a POST /attestations request. Throws
 * AttestationValidationError (with a specific code) on any violation;
 * returns a well-typed payload on success.
 */
export function validateAttestationSubmission(
  body: unknown,
  allowedOperators: Record<AttestationKind, string[]>,
): AttestationSubmissionPayload {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new AttestationValidationError("SCHEMA_VIOLATION", "Request body must be a JSON object");
  }
  const record = body as Record<string, unknown>;

  const { kind } = record;
  if (typeof kind !== "string" || !ATTESTATION_KINDS.includes(kind as AttestationKind)) {
    throw new AttestationValidationError(
      "SCHEMA_VIOLATION",
      `"kind" must be one of ${ATTESTATION_KINDS.join(", ")}`,
    );
  }

  if (!isNonEmptyString(record.barSerial)) {
    throw new AttestationValidationError("SCHEMA_VIOLATION", '"barSerial" must be a non-empty string');
  }

  if (!isNonEmptyString(record.operatorId)) {
    throw new AttestationValidationError("SCHEMA_VIOLATION", '"operatorId" must be a non-empty string');
  }

  if (record.deviceId !== undefined && !isNonEmptyString(record.deviceId)) {
    throw new AttestationValidationError(
      "SCHEMA_VIOLATION",
      '"deviceId", when present, must be a non-empty string',
    );
  }

  if (!isNonEmptyString(record.evidence)) {
    throw new AttestationValidationError("MISSING_EVIDENCE", '"evidence" (base64) is required');
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(record.evidence, "base64");
  } catch {
    throw new AttestationValidationError("SCHEMA_VIOLATION", '"evidence" must be valid base64');
  }
  if (decoded.length === 0) {
    throw new AttestationValidationError("MISSING_EVIDENCE", '"evidence" decodes to zero bytes');
  }

  const typedKind = kind as AttestationKind;
  const permitted = allowedOperators[typedKind];
  if (!permitted.includes(record.operatorId)) {
    throw new AttestationValidationError(
      "UNKNOWN_OPERATOR",
      `operatorId "${record.operatorId}" is not permitted to submit ${typedKind} attestations`,
    );
  }

  return {
    kind: typedKind,
    barSerial: record.barSerial,
    operatorId: record.operatorId,
    evidence: record.evidence,
    deviceId: record.deviceId as string | undefined,
  };
}
