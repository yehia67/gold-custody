import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import { MockLedgerClient } from "@gold-custody/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAttestationServer } from "../src/server";
import { makeTestConfig } from "./testConfig";

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

describe("attestation-service HTTP server", () => {
  let evidenceStoreDir: string;
  let ledgerClient: MockLedgerClient;
  let server: ReturnType<typeof createAttestationServer>;
  let baseUrl: string;

  beforeEach(async () => {
    evidenceStoreDir = mkdtempSync(join(tmpdir(), "gold-custody-evidence-"));
    ledgerClient = new MockLedgerClient();
    const config = makeTestConfig({}, evidenceStoreDir);
    server = createAttestationServer({ config, ledgerClient, logger: { info: () => {}, warn: () => {}, error: () => {} } });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(evidenceStoreDir, { recursive: true, force: true });
  });

  async function post(body: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${baseUrl}/attestations`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "test-api-key", ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("rejects an unknown operator", async () => {
    const { status, body } = await post({
      kind: "Purity",
      barSerial: "BAR-1",
      operatorId: "Investor1",
      evidence: base64("assay report"),
    });

    expect(status).toBe(400);
    expect(body.code).toBe("UNKNOWN_OPERATOR");
    expect(ledgerClient.submittedAttestations).toHaveLength(0);
  });

  it("rejects a submission missing evidence", async () => {
    const { status, body } = await post({
      kind: "Purity",
      barSerial: "BAR-1",
      operatorId: "Assayer",
    });

    expect(status).toBe(400);
    expect(body.code).toBe("MISSING_EVIDENCE");
    expect(ledgerClient.submittedAttestations).toHaveLength(0);
  });

  it("rejects a schema violation (invalid kind)", async () => {
    const { status, body } = await post({
      kind: "NotAKind",
      barSerial: "BAR-1",
      operatorId: "Assayer",
      evidence: base64("assay report"),
    });

    expect(status).toBe(400);
    expect(body.code).toBe("SCHEMA_VIOLATION");
  });

  it("rejects a schema violation (missing barSerial)", async () => {
    const { status, body } = await post({
      kind: "Purity",
      operatorId: "Assayer",
      evidence: base64("assay report"),
    });

    expect(status).toBe(400);
    expect(body.code).toBe("SCHEMA_VIOLATION");
  });

  it("accepts a happy-path single-signer attestation and submits it to the ledger", async () => {
    const evidenceText = "assay report contents";
    const { status, body } = await post({
      kind: "Purity",
      barSerial: "BAR-1",
      operatorId: "Assayer",
      evidence: base64(evidenceText),
    });

    expect(status).toBe(201);
    expect(body.status).toBe("submitted");
    expect(typeof body.contractId).toBe("string");

    const expectedHash = createHash("sha256").update(evidenceText, "utf8").digest("hex");
    expect(body.evidenceHash).toBe(expectedHash);
    expect(readFileSync(join(evidenceStoreDir, expectedHash), "utf8")).toBe(evidenceText);

    expect(ledgerClient.submittedAttestations).toHaveLength(1);
    expect(ledgerClient.submittedAttestations[0]).toMatchObject({
      kind: "Purity",
      barSerial: "BAR-1",
      operatorId: "Assayer",
      evidenceHash: expectedHash,
    });
  });

  it("holds a Weight attestation pending co-signature until both human and device halves arrive", async () => {
    const humanResponse = await post({
      kind: "Weight",
      barSerial: "BAR-2",
      operatorId: "Weighmaster",
      evidence: base64("human reading: 1000.00g"),
    });
    expect(humanResponse.status).toBe(202);
    expect(humanResponse.body.status).toBe("pending-cosign");
    expect(humanResponse.body.role).toBe("human");
    expect(ledgerClient.submittedAttestations).toHaveLength(0);

    const deviceResponse = await post({
      kind: "Weight",
      barSerial: "BAR-2",
      operatorId: "WeighDevice",
      deviceId: "SCALE-42",
      evidence: base64("device reading: 1000.00g"),
    });
    expect(deviceResponse.status).toBe(201);
    expect(deviceResponse.body.status).toBe("co-signed");
    expect(typeof deviceResponse.body.contractId).toBe("string");

    expect(ledgerClient.submittedAttestations).toHaveLength(1);
    const submitted = ledgerClient.submittedAttestations[0];
    expect(submitted.kind).toBe("Weight");
    expect(submitted.barSerial).toBe("BAR-2");
    expect(submitted.operatorId).toBe("Weighmaster");
    expect(submitted.coSignedOperatorId).toBe("WeighDevice");
    expect(submitted.deviceId).toBe("SCALE-42");
  });

  it("rejects a Weight attestation from an operator not permitted to submit weight readings", async () => {
    const { status, body } = await post({
      kind: "Weight",
      barSerial: "BAR-3",
      operatorId: "Assayer",
      evidence: base64("bogus weight reading"),
    });

    expect(status).toBe(400);
    expect(body.code).toBe("UNKNOWN_OPERATOR");
  });

  it("allows /healthz without an API key", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
  });

  it("rejects a request with no X-API-Key header", async () => {
    const res = await fetch(`${baseUrl}/attestations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "Purity", barSerial: "BAR-1", operatorId: "Assayer", evidence: base64("x") }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(ledgerClient.submittedAttestations).toHaveLength(0);
  });

  it("rejects a request with the wrong X-API-Key value", async () => {
    const { status, body } = await post(
      { kind: "Purity", barSerial: "BAR-1", operatorId: "Assayer", evidence: base64("x") },
      { "x-api-key": "wrong-key" },
    );

    expect(status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(ledgerClient.submittedAttestations).toHaveLength(0);
  });

  it("rejects a raw body larger than the size cap with 413", async () => {
    const res = await fetch(`${baseUrl}/attestations`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "test-api-key" },
      body: JSON.stringify({
        kind: "Purity",
        barSerial: "BAR-1",
        operatorId: "Assayer",
        evidence: base64("x".repeat(2_000_000)),
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(413);
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(ledgerClient.submittedAttestations).toHaveLength(0);
  });

  it("rejects decoded evidence larger than the 512KB cap with 413", async () => {
    const { status, body } = await post({
      kind: "Purity",
      barSerial: "BAR-1",
      operatorId: "Assayer",
      evidence: base64("y".repeat(600_000)),
    });

    expect(status).toBe(413);
    expect(body.code).toBe("EVIDENCE_TOO_LARGE");
    expect(ledgerClient.submittedAttestations).toHaveLength(0);
  });

  it("rejects evidence containing invalid base64 characters", async () => {
    const { status, body } = await post({
      kind: "Purity",
      barSerial: "BAR-1",
      operatorId: "Assayer",
      evidence: "not-valid-base64!!!",
    });

    expect(status).toBe(400);
    expect(body.code).toBe("SCHEMA_VIOLATION");
    expect(ledgerClient.submittedAttestations).toHaveLength(0);
  });

  it("rejects base64 evidence with a length that is not a multiple of 4", async () => {
    const { status, body } = await post({
      kind: "Purity",
      barSerial: "BAR-1",
      operatorId: "Assayer",
      evidence: "abcde",
    });

    expect(status).toBe(400);
    expect(body.code).toBe("SCHEMA_VIOLATION");
  });

  it("rejects a conflicting second half for the same role with a different evidenceHash", async () => {
    const first = await post({
      kind: "Weight",
      barSerial: "BAR-4",
      operatorId: "Weighmaster",
      evidence: base64("human reading: 1000.00g"),
    });
    expect(first.status).toBe(202);

    const conflicting = await post({
      kind: "Weight",
      barSerial: "BAR-4",
      operatorId: "Weighmaster",
      evidence: base64("human reading: 999.00g (different!)"),
    });

    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe("COSIGN_CONFLICT");
    expect(ledgerClient.submittedAttestations).toHaveLength(0);
  });

  it("allows the same role to idempotently resubmit identical evidence without conflict", async () => {
    const payload = {
      kind: "Weight",
      barSerial: "BAR-5",
      operatorId: "Weighmaster",
      evidence: base64("human reading: 1000.00g"),
    };
    const first = await post(payload);
    const second = await post(payload);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
  });
});
