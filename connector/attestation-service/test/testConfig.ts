import type { GoldCustodyConfig } from "@gold-custody/shared";

/** Minimal, self-contained GoldCustodyConfig fixture for attestation-service tests. */
export function makeTestConfig(overrides: Partial<GoldCustodyConfig> = {}, evidenceStore: string): GoldCustodyConfig {
  return {
    parties: {
      systemOperator: "SystemOperator",
      custodian: "Custodian",
      regulator: "Regulator",
      fundManager: "FundManager",
      registrar: "Registrar",
      investor1: "Investor1",
      investor2: "Investor2",
      oracleOperator1: "OracleOp1",
      oracleOperator2: "OracleOp2",
      navAgent: "NavAgent",
      weighmaster: "Weighmaster",
      weighDevice: "WeighDevice",
      assayer: "Assayer",
      transporter: "Transporter",
      auditor: "Auditor",
      complianceProvider: "ComplianceProvider",
      vaultKeeper: "VaultKeeper",
      cashIssuer: "CashIssuer",
    },
    ledger: {
      jsonApiUrl: "http://localhost:7575",
      grpcHost: "localhost",
      grpcPort: 6865,
      cnQuickstartPath: "../cn-quickstart",
    },
    business: {
      minPurity: "0.995",
      attestationMaxAgeSeconds: 86400,
      assayValiditySeconds: 2592000,
      navValiditySeconds: 3600,
      escrowDefaultExpirySeconds: 86400,
      maxOracleDivergenceBps: 50,
      proofOfReserveMaxAgeSeconds: 604800,
      gramsPerUnit: "1.0",
      weightMatchToleranceGrams: "0.01",
      inKindRedemptionThresholdGrams: "1000.0",
      defaultTransferLimit: "100000.0",
      defaultFeeBps: 10,
      navPublishIntervalSeconds: 60,
    },
    connectors: {
      navPublisher: { port: 8101, xauSources: [] },
      attestationService: { port: 0, evidenceStore },
      iso20022: { inboxDir: "./inbox", outboxDir: "./outbox" },
    },
    configDir: "/tmp",
    ...overrides,
  };
}
