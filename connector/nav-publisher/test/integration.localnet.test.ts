import { join } from "node:path";
import { loadConfig, MockLedgerClient, resolveConfigPath } from "@gold-custody/shared";
import { describe, expect, it } from "vitest";
import { checkAndPublish } from "../src/publisher";
import { createXauSource } from "../src/sources";

/**
 * Real integration test against a running LocalNet. Skipped automatically
 * unless LOCALNET=1 is set or the configured ledger JSON API is actually
 * reachable, so `npm test` stays green in CI with no LocalNet available.
 * Uses MockLedgerClient as the ledger-side stand-in either way (see
 * shared/src/ledgerClient.ts — no real JSON Ledger API client exists yet in
 * this prototype), so this test only exercises "is the network/config wired
 * correctly", not a real ledger submission.
 */
async function isLocalNetAvailable(jsonApiUrl: string): Promise<boolean> {
  if (process.env.LOCALNET === "1") {
    return true;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    try {
      await fetch(jsonApiUrl, { signal: controller.signal });
      return true;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}

const configPath = join(process.cwd(), "..", "config", "localnet.yaml");
const config = loadConfig(process.env.GOLD_CUSTODY_CONFIG_PATH ?? configPath);
const localNetAvailable = await isLocalNetAvailable(config.ledger.jsonApiUrl);

describe.skipIf(!localNetAvailable)("nav-publisher LocalNet integration", () => {
  it("publishes a real XAU price point using the configured sources", async () => {
    const sources = config.connectors.navPublisher.xauSources.map((sourceConfig) =>
      createXauSource(sourceConfig, (relativePath) => resolveConfigPath(config, relativePath)),
    );
    const ledgerClient = new MockLedgerClient();

    const outcome = await checkAndPublish({
      sources,
      maxOracleDivergenceBps: config.business.maxOracleDivergenceBps,
      ledgerClient,
    });

    expect(outcome.published).toBe(true);
    expect(ledgerClient.publishedPrices).toHaveLength(1);
  });
});
