import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { GoldCustodyConfig, LedgerClient } from "@gold-custody/shared";
import { AttestationValidationError, allowedOperatorsByKind, validateAttestationSubmission } from "./schema";
import { WeightCoSignTracker, type AttestationHalf } from "./coSign";
import { storeEvidence } from "./evidenceStore";

export interface AttestationServiceDeps {
  config: GoldCustodyConfig;
  ledgerClient: LedgerClient;
  logger?: Pick<typeof console, "info" | "warn" | "error">;
}

interface JsonResponse {
  status: number;
  body: Record<string, unknown>;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) {
    return undefined;
  }
  return JSON.parse(raw);
}

export function createAttestationRequestHandler(deps: AttestationServiceDeps) {
  const logger = deps.logger ?? console;
  const allowedOperators = allowedOperatorsByKind(deps.config.parties);
  const coSignTracker = new WeightCoSignTracker();

  async function handleSubmitAttestation(req: IncomingMessage): Promise<JsonResponse> {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      return { status: 400, body: { error: "Request body must be valid JSON", code: "SCHEMA_VIOLATION" } };
    }

    let submission;
    try {
      submission = validateAttestationSubmission(body, allowedOperators);
    } catch (err) {
      if (err instanceof AttestationValidationError) {
        return { status: 400, body: { error: err.message, code: err.code } };
      }
      throw err;
    }

    const { hash: evidenceHash } = await storeEvidence(deps.config.connectors.attestationService.evidenceStore, submission.evidence);

    if (submission.kind !== "Weight") {
      const result = await deps.ledgerClient.submitAttestation({
        kind: submission.kind,
        barSerial: submission.barSerial,
        operatorId: submission.operatorId,
        evidenceHash,
        deviceId: submission.deviceId,
      });
      logger.info(`Submitted ${submission.kind} attestation for ${submission.barSerial}: ${result.contractId}`);
      return { status: 201, body: { status: "submitted", contractId: result.contractId, evidenceHash } };
    }

    const role = submission.operatorId === deps.config.parties.weighDevice ? "device" : "human";
    const half: AttestationHalf = {
      role,
      operatorId: submission.operatorId,
      evidenceHash,
      deviceId: submission.deviceId,
      submittedAt: new Date().toISOString(),
    };
    const pair = coSignTracker.submit(submission.barSerial, half);

    if (!pair) {
      logger.info(`Weight attestation half (${role}) recorded for ${submission.barSerial}; awaiting co-signature`);
      return { status: 202, body: { status: "pending-cosign", barSerial: submission.barSerial, role, evidenceHash } };
    }

    const result = await deps.ledgerClient.submitAttestation({
      kind: "Weight",
      barSerial: submission.barSerial,
      operatorId: pair.human.operatorId,
      evidenceHash: pair.human.evidenceHash,
      deviceId: pair.device.deviceId,
      coSignedOperatorId: pair.device.operatorId,
      coSignedEvidenceHash: pair.device.evidenceHash,
    });
    logger.info(`Co-signed Weight attestation for ${submission.barSerial}: ${result.contractId}`);
    return { status: 201, body: { status: "co-signed", contractId: result.contractId, evidenceHash } };
  }

  return async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method === "GET" && req.url === "/healthz") {
        respond(res, { status: 200, body: { status: "ok" } });
        return;
      }
      if (req.method === "POST" && req.url === "/attestations") {
        respond(res, await handleSubmitAttestation(req));
        return;
      }
      respond(res, { status: 404, body: { error: "not found" } });
    } catch (err) {
      logger.error(`attestation-service request failed: ${(err as Error).message}`);
      respond(res, { status: 500, body: { error: "internal error" } });
    }
  };
}

function respond(res: ServerResponse, response: JsonResponse): void {
  res.writeHead(response.status, { "content-type": "application/json" });
  res.end(JSON.stringify(response.body));
}

export function createAttestationServer(deps: AttestationServiceDeps): Server {
  return createServer(createAttestationRequestHandler(deps));
}
