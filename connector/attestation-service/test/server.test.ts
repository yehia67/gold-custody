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

  async function post(body: unknown) {
    const res = await fetch(`${baseUrl}/attestations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
});
