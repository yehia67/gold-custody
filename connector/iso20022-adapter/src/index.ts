import { createLedgerClient, defaultConfigPath, loadConfig, resolveConfigPath } from "@gold-custody/shared";
import { Iso20022Adapter } from "./adapter";

export { Iso20022Adapter, type Iso20022AdapterOptions } from "./adapter";
export * from "./xml";

const POLL_INTERVAL_MS = 2000;

function main(): void {
  const config = loadConfig(defaultConfigPath());
  // Uses MockLedgerClient unless ledger.mode: live (or LEDGER_MODE=live) is
  // set, in which case a JsonLedgerClient is required — see
  // shared/src/ledgerClient.ts.
  const ledgerClient = createLedgerClient(config.ledger);

  const adapter = new Iso20022Adapter({
    ledgerClient,
    inboxDir: resolveConfigPath(config, config.connectors.iso20022.inboxDir),
    outboxDir: resolveConfigPath(config, config.connectors.iso20022.outboxDir),
  });

  const stop = adapter.start();
  const pollTimer = setInterval(() => {
    adapter.processInboxOnce().catch((err) => console.error(`iso20022-adapter inbox poll failed: ${(err as Error).message}`));
  }, POLL_INTERVAL_MS);

  console.log(
    `iso20022-adapter watching inbox=${config.connectors.iso20022.inboxDir} outbox=${config.connectors.iso20022.outboxDir}`,
  );

  process.on("SIGTERM", () => {
    stop();
    clearInterval(pollTimer);
  });
}

if (require.main === module) {
  main();
}
