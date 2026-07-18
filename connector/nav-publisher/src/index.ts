import { createServer } from "node:http";
import { defaultConfigPath, loadConfig, MockLedgerClient, resolveConfigPath } from "@gold-custody/shared";
import { createXauSource } from "./sources";
import { checkAndPublish, startPublishLoop, type PublishOutcome } from "./publisher";

function main(): void {
  const config = loadConfig(defaultConfigPath());
  const sources = config.connectors.navPublisher.xauSources.map((sourceConfig) =>
    createXauSource(sourceConfig, (relativePath) => resolveConfigPath(config, relativePath)),
  );

  // No real Canton JSON Ledger API client is implemented in this prototype
  // (see shared/src/ledgerClient.ts); MockLedgerClient is the default
  // standalone-runnable wiring until one exists.
  const ledgerClient = new MockLedgerClient();
  const publisherOptions = {
    sources,
    maxOracleDivergenceBps: config.business.maxOracleDivergenceBps,
    ledgerClient,
  };

  let lastOutcome: PublishOutcome | undefined;
  checkAndPublish(publisherOptions).then((outcome) => {
    lastOutcome = outcome;
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
  server.listen(config.connectors.navPublisher.port, () => {
    console.log(
      `nav-publisher healthz on port ${config.connectors.navPublisher.port} ` +
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
