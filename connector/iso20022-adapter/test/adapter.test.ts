import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLedgerClient } from "@gold-custody/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Iso20022Adapter } from "../src/adapter";
import { parseSetr010, parseSetr012 } from "../src/xml";

describe("Iso20022Adapter", () => {
  let inboxDir: string;
  let outboxDir: string;
  let ledgerClient: MockLedgerClient;
  let adapter: Iso20022Adapter;
  let stop: () => void;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "gold-custody-iso20022-"));
    inboxDir = join(dir, "inbox");
    outboxDir = join(dir, "outbox");
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
    rmSync(join(inboxDir, ".."), { recursive: true, force: true });
  });

  it("emits a setr.010 file to the outbox when the ledger creates a SubscriptionRequest", () => {
    ledgerClient.emitSubscriptionRequest({
      contractId: "sub-1",
      investorParty: "Investor1",
      fundId: "FUND-GOLD-1",
      amount: "10000.00",
      currency: "USD",
      requestedAt: "2026-07-18T10:00:00.000Z",
    });

    // The handler runs synchronously off emit but writes the file asynchronously;
    // give the microtask/IO queue a tick to flush.
    return waitFor(() => existsSync(join(outboxDir, "setr010-sub-1.xml"))).then(() => {
      const xml = readFileSync(join(outboxDir, "setr010-sub-1.xml"), "utf8");
      const parsed = parseSetr010(xml);
      expect(parsed).toEqual({
        messageId: "SUB-sub-1",
        createdAt: "2026-07-18T10:00:00.000Z",
        subscriptionRequestContractId: "sub-1",
        investorParty: "Investor1",
        fundId: "FUND-GOLD-1",
        amount: "10000.00",
        currency: "USD",
      });
    });
  });

  it("emits a setr.012 confirmation to the outbox when the ledger settles", () => {
    ledgerClient.emitSettlement({
      contractId: "settle-1",
      subscriptionRequestContractId: "sub-1",
      fundId: "FUND-GOLD-1",
      investorParty: "Investor1",
      unitsIssued: "3.7735849",
      settledAt: "2026-07-18T10:05:00.000Z",
    });

    return waitFor(() => existsSync(join(outboxDir, "setr012-settle-1.xml"))).then(() => {
      const xml = readFileSync(join(outboxDir, "setr012-settle-1.xml"), "utf8");
      const parsed = parseSetr012(xml);
      expect(parsed).toEqual({
        messageId: "CONF-settle-1",
        createdAt: "2026-07-18T10:05:00.000Z",
        subscriptionRequestContractId: "sub-1",
        settlementContractId: "settle-1",
        fundId: "FUND-GOLD-1",
        investorParty: "Investor1",
        unitsIssued: "3.7735849",
      });
    });
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
