import { defaultConfigPath, loadConfig, MockLedgerClient } from "@gold-custody/shared";
import { createAttestationServer } from "./server";

export { createAttestationServer, createAttestationRequestHandler, type AttestationServiceDeps } from "./server";
export * from "./schema";
export * from "./coSign";
export * from "./evidenceStore";

function main(): void {
  const config = loadConfig(defaultConfigPath());
  // No real Canton JSON Ledger API client is implemented in this prototype
  // (see shared/src/ledgerClient.ts); MockLedgerClient is the default
  // standalone-runnable wiring until one exists.
  const ledgerClient = new MockLedgerClient();
  const server = createAttestationServer({ config, ledgerClient });

  server.listen(config.connectors.attestationService.port, () => {
    console.log(`attestation-service listening on port ${config.connectors.attestationService.port}`);
  });

  process.on("SIGTERM", () => server.close());
}

if (require.main === module) {
  main();
}
