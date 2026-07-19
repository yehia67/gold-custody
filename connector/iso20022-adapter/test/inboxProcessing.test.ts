import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLedgerClient } from "@gold-custody/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Iso20022Adapter } from "../src/adapter";
import { buildSetr010 } from "../src/xml";

describe("Iso20022Adapter inbox processing: rename order, mutex, and quarantine", () => {
  let dir: string;
  let inboxDir: string;
  let outboxDir: string;
  let ledgerClient: MockLedgerClient;
  let adapter: Iso20022Adapter;
  let stop: () => void;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gold-custody-iso20022-inbox-"));
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

  function writeOrder(fileName: string, contractId: string): void {
    const xml = buildSetr010({
      messageId: `SUB-${contractId}`,
      createdAt: "2026-07-18T09:00:00.000Z",
      subscriptionRequestContractId: contractId,
      investorParty: "Investor1",
      fundId: "FUND-GOLD-1",
      amount: "1000.00",
      currency: "USD",
    });
    writeFileSync(join(inboxDir, fileName), xml, "utf8");
  }

  it("moves the file to processing/ before submitting, and to processed/ only after the ledger submit succeeds", async () => {
    writeOrder("order-1.xml", "sub-1");

    let sawProcessingFileDuringSubmit = false;
    let sawInboxRootFileDuringSubmit = false;
    const originalSubmit = ledgerClient.submitAcceptSubscription.bind(ledgerClient);
    ledgerClient.submitAcceptSubscription = async (input) => {
      sawProcessingFileDuringSubmit = existsSync(join(inboxDir, "processing", "order-1.xml"));
      sawInboxRootFileDuringSubmit = existsSync(join(inboxDir, "order-1.xml"));
      return originalSubmit(input);
    };

    await adapter.processInboxOnce();

    // The file must already be in processing/ (and gone from the inbox
    // root) at the moment the ledger submit is invoked...
    expect(sawProcessingFileDuringSubmit).toBe(true);
    expect(sawInboxRootFileDuringSubmit).toBe(false);
    // ...and only moved into processed/ after that submit resolved successfully.
    expect(existsSync(join(inboxDir, "processing", "order-1.xml"))).toBe(false);
    expect(existsSync(join(inboxDir, "processed", "order-1.xml"))).toBe(true);
    expect(ledgerClient.acceptedSubscriptions).toHaveLength(1);
  });

  it("quarantines a file into failed/ when the ledger submit rejects, without leaving it re-processable in the inbox root", async () => {
    writeOrder("order-2.xml", "sub-2");
    ledgerClient.submitAcceptSubscription = async () => {
      throw new Error("ledger unavailable");
    };

    const processed = await adapter.processInboxOnce();

    expect(processed).toEqual([]);
    expect(readdirSync(inboxDir).sort()).toEqual(["failed", "processing"]);
    expect(readdirSync(join(inboxDir, "failed"))).toEqual(["order-2.xml"]);
    expect(readdirSync(join(inboxDir, "processing"))).toEqual([]);

    // A second scan must not re-submit the quarantined file.
    const secondPass = await adapter.processInboxOnce();
    expect(secondPass).toEqual([]);
    expect(ledgerClient.acceptedSubscriptions).toHaveLength(0);
  });

  it("quarantines a structurally invalid setr.010 file (missing a required tag) into failed/ without submitting", async () => {
    const invalidXml = buildSetr010({
      messageId: "SUB-bad",
      createdAt: "2026-07-18T09:00:00.000Z",
      subscriptionRequestContractId: "sub-bad",
      investorParty: "Investor1",
      fundId: "FUND-GOLD-1",
      amount: "1000.00",
      currency: "USD",
    }).replace("<MsgId>SUB-bad</MsgId>\n", "");
    writeFileSync(join(inboxDir, "order-bad.xml"), invalidXml, "utf8");

    const processed = await adapter.processInboxOnce();

    expect(processed).toEqual([]);
    expect(readdirSync(join(inboxDir, "failed"))).toEqual(["order-bad.xml"]);
    expect(ledgerClient.acceptedSubscriptions).toHaveLength(0);
    expect(readFileSync(join(inboxDir, "failed", "order-bad.xml"), "utf8")).toBe(invalidXml);
  });

  it("serializes overlapping processInboxOnce calls so they cannot run concurrently", async () => {
    writeOrder("order-3.xml", "sub-3");
    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;
    const originalSubmit = ledgerClient.submitAcceptSubscription.bind(ledgerClient);
    ledgerClient.submitAcceptSubscription = async (input) => {
      concurrentCalls += 1;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      await new Promise((resolve) => setTimeout(resolve, 30));
      concurrentCalls -= 1;
      return originalSubmit(input);
    };

    const [firstResult, secondResult] = await Promise.all([adapter.processInboxOnce(), adapter.processInboxOnce()]);

    expect(maxConcurrentCalls).toBe(1);
    // Both callers observe the same single scan's result (the second call
    // joined the in-flight scan rather than starting a second one).
    expect(firstResult).toEqual(secondResult);
    expect(ledgerClient.acceptedSubscriptions).toHaveLength(1);
  });

  it("allows a new scan to start once the previous one has completed", async () => {
    writeOrder("order-4.xml", "sub-4");
    const first = await adapter.processInboxOnce();
    expect(first).toEqual(["order-4.xml"]);

    writeOrder("order-5.xml", "sub-5");
    const second = await adapter.processInboxOnce();
    expect(second).toEqual(["order-5.xml"]);
    expect(ledgerClient.acceptedSubscriptions).toHaveLength(2);
  });
});
