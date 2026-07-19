import { createLedgerClient, defaultConfigPath, loadConfig } from "@gold-custody/shared";
import { createAttestationServer } from "./server";

export { createAttestationServer, createAttestationRequestHandler, type AttestationServiceDeps } from "./server";
export * from "./schema";
export * from "./coSign";
export * from "./evidenceStore";

function main(): void {
  const config = loadConfig(defaultConfigPath());
  // Uses MockLedgerClient unless ledger.mode: live (or LEDGER_MODE=live) is
  // set, in which case a JsonLedgerClient is required — see
  // shared/src/ledgerClient.ts.
  const ledgerClient = createLedgerClient(config.ledger);
  const server = createAttestationServer({ config, ledgerClient });

  const { port, host } = config.connectors.attestationService;
  server.listen(port, host, () => {
    console.log(`attestation-service listening on ${host}:${port}`);
  });

  process.on("SIGTERM", () => server.close());
}

if (require.main === module) {
  main();
}
