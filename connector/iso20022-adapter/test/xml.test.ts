import { describe, expect, it } from "vitest";
import { buildSetr010, buildSetr012, parseSetr010, parseSetr012 } from "../src/xml";

describe("setr.010 build/parse", () => {
  it("round-trips a subscription order message", () => {
    const message = {
      messageId: "SUB-sub-1",
      createdAt: "2026-07-18T10:00:00.000Z",
      subscriptionRequestContractId: "sub-1",
      investorParty: "Investor1",
      fundId: "FUND-GOLD-1",
      amount: "10000.00",
      currency: "USD",
    };

    const xml = buildSetr010(message);
    expect(xml).toContain('xmlns="urn:gold-custody:iso20022:setr.010.subset:1"');
    expect(xml).toContain("<SubscriptionRequestId>sub-1</SubscriptionRequestId>");
    expect(xml).toContain('<Amt Ccy="USD">10000.00</Amt>');

    expect(parseSetr010(xml)).toEqual(message);
  });

  it("escapes XML special characters in text fields", () => {
    const message = {
      messageId: "SUB-<sub>",
      createdAt: "2026-07-18T10:00:00.000Z",
      subscriptionRequestContractId: "sub-1",
      investorParty: 'Investor "One" & Co',
      fundId: "FUND-GOLD-1",
      amount: "10000.00",
      currency: "USD",
    };

    const xml = buildSetr010(message);
    expect(xml).not.toContain('Investor "One" & Co');
    expect(parseSetr010(xml).investorParty).toBe('Investor "One" & Co');
  });
});

describe("setr.012 build/parse", () => {
  it("round-trips a subscription order confirmation message", () => {
    const message = {
      messageId: "CONF-settle-1",
      createdAt: "2026-07-18T10:05:00.000Z",
      subscriptionRequestContractId: "sub-1",
      settlementContractId: "settle-1",
      fundId: "FUND-GOLD-1",
      investorParty: "Investor1",
      unitsIssued: "3.7735849",
    };

    const xml = buildSetr012(message);
    expect(xml).toContain('xmlns="urn:gold-custody:iso20022:setr.012.subset:1"');
    expect(xml).toContain("<UnitsIssued>3.7735849</UnitsIssued>");

    expect(parseSetr012(xml)).toEqual(message);
  });
});
