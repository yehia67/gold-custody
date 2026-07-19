import { createServer } from "node:http";
import { createLedgerClient, defaultConfigPath, loadConfig, resolveConfigPath } from "@gold-custody/shared";
import { createXauSource } from "./sources";
import { checkAndPublish, startPublishLoop, type PublishOutcome } from "./publisher";

function main(): void {
  const config = loadConfig(defaultConfigPath());
  const sources = config.connectors.navPublisher.xauSources.map((sourceConfig) =>
    createXauSource(sourceConfig, (relativePath) => resolveConfigPath(config, relativePath)),
  );

  // Uses MockLedgerClient unless ledger.mode: live (or LEDGER_MODE=live) is
  // set, in which case a JsonLedgerClient is required — see
  // shared/src/ledgerClient.ts.
  const ledgerClient = createLedgerClient(config.ledger);
  const publisherOptions = {
    sources,
    maxOracleDivergenceBps: config.business.maxOracleDivergenceBps,
    ledgerClient,
  };

  let lastOutcome: PublishOutcome | undefined;
  checkAndPublish(publisherOptions)
    .then((outcome) => {
      lastOutcome = outcome;
    })
    .catch((err) => {
      console.error(`nav-publisher initial publish failed: ${(err as Error).message}`);
    });
  const stopLoop = startPublishLoop(publisherOptions, config.business.navPublishIntervalSeconds);

  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", lastOutcome }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  const { port, host } = config.connectors.navPublisher;
  server.listen(port, host, () => {
    console.log(
      `nav-publisher healthz on ${host}:${port} ` +
        `(interval ${config.business.navPublishIntervalSeconds}s, ${sources.length} XAU sources)`,
    );
  });

  process.on("SIGTERM", () => {
    stopLoop();
    server.close();
  });
}

if (require.main === module) {
  main();
}
