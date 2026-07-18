import type { LedgerClient } from "@gold-custody/shared";
import { average, maxPairwiseDivergenceBps } from "./divergence";
import type { XauSource } from "./sources";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const consoleLogger: Logger = console;

export interface NavPublisherOptions {
  sources: XauSource[];
  maxOracleDivergenceBps: number;
  ledgerClient: LedgerClient;
  logger?: Logger;
}

export interface PublishOutcome {
  published: boolean;
  sourceValues: Record<string, number>;
  divergenceBps: number;
  value?: number;
  reason?: string;
  contractId?: string;
}

/**
 * Reads every configured XAU source, and either publishes the average value
 * to the ledger (when sources agree within maxOracleDivergenceBps) or
 * refuses to publish and logs the divergence.
 */
export async function checkAndPublish(options: NavPublisherOptions): Promise<PublishOutcome> {
  const logger = options.logger ?? consoleLogger;
  const sourceValues: Record<string, number> = {};
  for (const source of options.sources) {
    sourceValues[source.name] = await source.getValue();
  }

  const values = Object.values(sourceValues);
  const divergenceBps = maxPairwiseDivergenceBps(values);

  if (divergenceBps > options.maxOracleDivergenceBps) {
    const reason =
      `Refusing to publish XAU price: sources diverge by ${divergenceBps} bps ` +
      `(max allowed ${options.maxOracleDivergenceBps} bps). Source values: ${JSON.stringify(sourceValues)}`;
    logger.warn(reason);
    return { published: false, sourceValues, divergenceBps, reason };
  }

  const value = average(values);
  const result = await options.ledgerClient.publishXauPrice({
    value,
    sources: options.sources.map((s) => ({ name: s.name })),
    sourceValues,
  });
  logger.info(`Published XAU price ${value} (divergence ${divergenceBps} bps, contract ${result.contractId})`);
  return { published: true, sourceValues, divergenceBps, value, contractId: result.contractId };
}

/** Runs checkAndPublish on a fixed interval; returned function stops the loop. */
export function startPublishLoop(options: NavPublisherOptions, intervalSeconds: number): () => void {
  const timer = setInterval(() => {
    checkAndPublish(options).catch((err) => {
      (options.logger ?? consoleLogger).error(`nav-publisher tick failed: ${(err as Error).message}`);
    });
  }, intervalSeconds * 1000);
  return () => clearInterval(timer);
}
