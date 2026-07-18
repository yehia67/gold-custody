import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLedgerClient } from "@gold-custody/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Iso20022Adapter } from "../src/adapter";
import { buildSetr010, parseSetr012 } from "../src/xml";

describe("iso20022-adapter round trip: file in -> ledger settle -> confirmation file out", () => {
  let dir: string;
  let inboxDir: string;
  let outboxDir: string;
  let ledgerClient: MockLedgerClient;
  let adapter: Iso20022Adapter;
  let stop: () => void;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gold-custody-iso20022-roundtrip-"));
    inboxDir = join(dir, "inbox");
    outboxDir = join(dir, "outbox");
    mkdirSync(inboxDir, { recursive: true });
    ledgerClient = new MockLedgerClient();
    adapter = new Iso20022Adapter({
      ledgerClient,
      inboxDir,
      outboxDir,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    stop = adapter.start();
  });

  afterEach(() => {
    stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("processes an inbound setr.010 order, submits it to the ledger, and emits a matching setr.012 on settlement", async () => {
    const inboundOrder = buildSetr010({
      messageId: "SUB-external-1",
      createdAt: "2026-07-18T09:00:00.000Z",
      subscriptionRequestContractId: "sub-ext-1",
      investorParty: "Investor2",
      fundId: "FUND-GOLD-1",
      amount: "25000.50",
      currency: "USD",
    });
    writeFileSync(join(inboxDir, "order-1.xml"), inboundOrder, "utf8");

    // Step 1: file in.
    const processed = await adapter.processInboxOnce();
    expect(processed).toEqual(["order-1.xml"]);
    expect(readdirSync(inboxDir)).toEqual(["processed"]);
    expect(readdirSync(join(inboxDir, "processed"))).toEqual(["order-1.xml"]);

    // Step 2: ledger command was actually submitted.
    expect(ledgerClient.acceptedSubscriptions).toHaveLength(1);
    expect(ledgerClient.acceptedSubscriptions[0]).toEqual({
      subscriptionRequestContractId: "sub-ext-1",
      investorParty: "Investor2",
      fundId: "FUND-GOLD-1",
      amount: "25000.50",
      currency: "USD",
    });

    // Step 3: ledger settle (simulated).
    ledgerClient.emitSettlement({
      contractId: "settle-ext-1",
      subscriptionRequestContractId: "sub-ext-1",
      fundId: "FUND-GOLD-1",
      investorParty: "Investor2",
      unitsIssued: "9.4339623",
      settledAt: "2026-07-18T09:05:00.000Z",
    });

    // Step 4: confirmation file out, with content assertions.
    const confirmationPath = join(outboxDir, "setr012-settle-ext-1.xml");
    await waitFor(() => existsSync(confirmationPath));
    const xml = readFileSync(confirmationPath, "utf8");
    expect(xml).toContain('xmlns="urn:gold-custody:iso20022:setr.012.subset:1"');
    expect(xml).toContain("<SubscriptionRequestId>sub-ext-1</SubscriptionRequestId>");
    expect(xml).toContain("<SettlementId>settle-ext-1</SettlementId>");
    expect(xml).toContain("<UnitsIssued>9.4339623</UnitsIssued>");

    expect(parseSetr012(xml)).toEqual({
      messageId: "CONF-settle-ext-1",
      createdAt: "2026-07-18T09:05:00.000Z",
      subscriptionRequestContractId: "sub-ext-1",
      settlementContractId: "settle-ext-1",
      fundId: "FUND-GOLD-1",
      investorParty: "Investor2",
      unitsIssued: "9.4339623",
    });
  });

  it("does not reprocess files already moved to inbox/processed", async () => {
    const inboundOrder = buildSetr010({
      messageId: "SUB-external-2",
      createdAt: "2026-07-18T09:00:00.000Z",
      subscriptionRequestContractId: "sub-ext-2",
      investorParty: "Investor1",
      fundId: "FUND-GOLD-1",
      amount: "1000.00",
      currency: "USD",
    });
    writeFileSync(join(inboxDir, "order-2.xml"), inboundOrder, "utf8");

    await adapter.processInboxOnce();
    const secondPass = await adapter.processInboxOnce();

    expect(secondPass).toEqual([]);
    expect(ledgerClient.acceptedSubscriptions).toHaveLength(1);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
