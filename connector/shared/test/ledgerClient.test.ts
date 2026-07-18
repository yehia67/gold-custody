import { describe, expect, it } from "vitest";
import { MockLedgerClient } from "../src/ledgerClient";

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
