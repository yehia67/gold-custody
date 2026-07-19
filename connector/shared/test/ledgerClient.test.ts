import { afterEach, describe, expect, it, vi } from "vitest";
import { createLedgerClient, JsonLedgerClient, MockLedgerClient, resolveLedgerMode } from "../src/ledgerClient";

describe("MockLedgerClient", () => {
  it("records published XAU prices", async () => {
    const client = new MockLedgerClient();
    const result = await client.publishXauPrice({
      value: 2650,
      sources: [{ name: "fixture-primary" }],
      sourceValues: { "fixture-primary": 2650 },
    });

    expect(result.contractId).toMatch(/^mock-PricePoint-/);
    expect(client.publishedPrices).toHaveLength(1);
    expect(client.publishedPrices[0].value).toBe(2650);
  });

  it("records submitted attestations", async () => {
    const client = new MockLedgerClient();
    await client.submitAttestation({
      kind: "Purity",
      barSerial: "BAR-1",
      operatorId: "Assayer",
      evidenceHash: "abc123",
    });

    expect(client.submittedAttestations).toHaveLength(1);
    expect(client.submittedAttestations[0].barSerial).toBe("BAR-1");
  });

  it("notifies subscribers on emitted SubscriptionRequest events, and stops after unsubscribe", () => {
    const client = new MockLedgerClient();
    const received: string[] = [];
    const unsubscribe = client.onSubscriptionRequestCreated((event) => received.push(event.contractId));

    client.emitSubscriptionRequest({
      contractId: "sub-1",
      investorParty: "Investor1",
      fundId: "FUND-1",
      amount: "1000.00",
      currency: "USD",
      requestedAt: new Date().toISOString(),
    });
    expect(received).toEqual(["sub-1"]);

    unsubscribe();
    client.emitSubscriptionRequest({
      contractId: "sub-2",
      investorParty: "Investor1",
      fundId: "FUND-1",
      amount: "1000.00",
      currency: "USD",
      requestedAt: new Date().toISOString(),
    });
    expect(received).toEqual(["sub-1"]);
  });

  it("notifies subscribers on emitted settlement events", () => {
    const client = new MockLedgerClient();
    const received: string[] = [];
    client.onSettlement((event) => received.push(event.contractId));

    client.emitSettlement({
      contractId: "settle-1",
      subscriptionRequestContractId: "sub-1",
      fundId: "FUND-1",
      investorParty: "Investor1",
      unitsIssued: "10.5",
      settledAt: new Date().toISOString(),
    });

    expect(received).toEqual(["settle-1"]);
  });

  it("always reports reachable via ping", async () => {
    const client = new MockLedgerClient();
    await expect(client.ping()).resolves.toBe(true);
  });
});

describe("JsonLedgerClient", () => {
  it("throws when constructed with an empty jsonApiUrl", () => {
    expect(() => new JsonLedgerClient({ jsonApiUrl: "" })).toThrow(/non-empty jsonApiUrl/);
  });

  it("submitCommand POSTs to /v2/commands/submit-and-wait and returns the parsed response", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("http://localhost:7575/v2/commands/submit-and-wait");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ commands: [] }));
      return new Response(JSON.stringify({ updateId: "abc" }), { status: 200 });
    });
    const client = new JsonLedgerClient({ jsonApiUrl: "http://localhost:7575", fetchImpl: fetchImpl as typeof fetch });

    const result = await client.submitCommand({ commands: [] });

    expect(result).toEqual({ updateId: "abc" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("submitCommand throws a descriptive error on a non-ok HTTP response", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const client = new JsonLedgerClient({ jsonApiUrl: "http://localhost:7575", fetchImpl: fetchImpl as typeof fetch });

    await expect(client.submitCommand({})).rejects.toThrow(/HTTP status 500/);
  });

  it("throws a clear 'not fully wired' error for unimplemented operations instead of silently mocking", async () => {
    const client = new JsonLedgerClient({ jsonApiUrl: "http://localhost:7575" });

    await expect(
      client.publishXauPrice({ value: 2650, sources: [], sourceValues: {} }),
    ).rejects.toThrow(/not fully wired/);
    await expect(
      client.submitAttestation({ kind: "Purity", barSerial: "BAR-1", operatorId: "Assayer", evidenceHash: "x" }),
    ).rejects.toThrow(/not fully wired/);
    expect(() => client.onSubscriptionRequestCreated(() => {})).toThrow(/not fully wired/);
    expect(() => client.onSettlement(() => {})).toThrow(/not fully wired/);
  });
});

describe("resolveLedgerMode / createLedgerClient", () => {
  const originalEnv = process.env.LEDGER_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LEDGER_MODE;
    } else {
      process.env.LEDGER_MODE = originalEnv;
    }
  });

  it("defaults to the configured mode when LEDGER_MODE is unset", () => {
    delete process.env.LEDGER_MODE;
    expect(resolveLedgerMode("mock")).toBe("mock");
    expect(resolveLedgerMode("live")).toBe("live");
  });

  it("LEDGER_MODE env var overrides config.ledger.mode", () => {
    process.env.LEDGER_MODE = "live";
    expect(resolveLedgerMode("mock")).toBe("live");

    process.env.LEDGER_MODE = "mock";
    expect(resolveLedgerMode("live")).toBe("mock");
  });

  it("ignores an unrecognized LEDGER_MODE value and falls back to config", () => {
    process.env.LEDGER_MODE = "bogus";
    expect(resolveLedgerMode("mock")).toBe("mock");
  });

  it("createLedgerClient returns a MockLedgerClient in mock mode", () => {
    delete process.env.LEDGER_MODE;
    const client = createLedgerClient({ mode: "mock", jsonApiUrl: "http://localhost:7575" });
    expect(client).toBeInstanceOf(MockLedgerClient);
  });

  it("createLedgerClient returns a JsonLedgerClient in live mode", () => {
    delete process.env.LEDGER_MODE;
    const client = createLedgerClient({ mode: "live", jsonApiUrl: "http://localhost:7575" });
    expect(client).toBeInstanceOf(JsonLedgerClient);
  });
});
