import { MockLedgerClient } from "@gold-custody/shared";
import { describe, expect, it, vi } from "vitest";
import { checkAndPublish, type Logger } from "../src/publisher";
import { FixtureSource } from "../src/sources";

const silentLogger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("checkAndPublish", () => {
  it("publishes the average value when sources agree within the divergence threshold", async () => {
    const ledgerClient = new MockLedgerClient();
    const sources = [new FixtureSource("fixture-primary", 2650), new FixtureSource("file-secondary", 2651.25)];

    const outcome = await checkAndPublish({
      sources,
      maxOracleDivergenceBps: 50,
      ledgerClient,
      logger: silentLogger,
    });

    expect(outcome.published).toBe(true);
    expect(outcome.divergenceBps).toBeLessThanOrEqual(50);
    expect(outcome.value).toBeCloseTo((2650 + 2651.25) / 2);
    expect(ledgerClient.publishedPrices).toHaveLength(1);
    expect(ledgerClient.publishedPrices[0].sourceValues).toEqual({
      "fixture-primary": 2650,
      "file-secondary": 2651.25,
    });
  });

  it("refuses to publish and logs divergence when sources diverge beyond the threshold", async () => {
    const ledgerClient = new MockLedgerClient();
    const warn = vi.fn();
    const sources = [new FixtureSource("fixture-primary", 2650), new FixtureSource("rogue-source", 3000)];

    const outcome = await checkAndPublish({
      sources,
      maxOracleDivergenceBps: 50,
      ledgerClient,
      logger: { info: vi.fn(), warn, error: vi.fn() },
    });

    expect(outcome.published).toBe(false);
    expect(outcome.divergenceBps).toBeGreaterThan(50);
    expect(outcome.reason).toMatch(/Refusing to publish/);
    expect(ledgerClient.publishedPrices).toHaveLength(0);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("diverge"));
  });

  it("publishes a single-source value with zero divergence", async () => {
    const ledgerClient = new MockLedgerClient();
    const sources = [new FixtureSource("only-source", 2650)];

    const outcome = await checkAndPublish({
      sources,
      maxOracleDivergenceBps: 50,
      ledgerClient,
      logger: silentLogger,
    });

    expect(outcome.published).toBe(true);
    expect(outcome.divergenceBps).toBe(0);
    expect(outcome.value).toBe(2650);
  });
});
