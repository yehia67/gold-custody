import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, resolveConfigPath } from "../src/config";

const VALID_YAML = `
parties:
  systemOperator: SystemOperator
  custodian: Custodian
  regulator: Regulator
  fundManager: FundManager
  registrar: Registrar
  investor1: Investor1
  investor2: Investor2
  oracleOperator1: OracleOp1
  oracleOperator2: OracleOp2
  navAgent: NavAgent
  weighmaster: Weighmaster
  weighDevice: WeighDevice
  assayer: Assayer
  transporter: Transporter
  auditor: Auditor
  complianceProvider: ComplianceProvider
  vaultKeeper: VaultKeeper
  cashIssuer: CashIssuer

ledger:
  jsonApiUrl: http://localhost:7575
  grpcHost: localhost
  grpcPort: 6865
  cnQuickstartPath: ../cn-quickstart

business:
  minPurity: "0.995"
  attestationMaxAgeSeconds: 86400
  assayValiditySeconds: 2592000
  navValiditySeconds: 3600
  escrowDefaultExpirySeconds: 86400
  maxOracleDivergenceBps: 50
  proofOfReserveMaxAgeSeconds: 604800
  gramsPerUnit: "1.0"
  weightMatchToleranceGrams: "0.01"
  inKindRedemptionThresholdGrams: "1000.0"
  defaultTransferLimit: "100000.0"
  defaultFeeBps: 10
  navPublishIntervalSeconds: 60

connectors:
  navPublisher:
    port: 8101
    xauSources:
      - type: fixture
        name: fixture-primary
        value: "2650.00"
      - type: jsonFile
        name: file-secondary
        path: ./connector/nav-publisher/fixtures/xau.json
  attestationService:
    port: 8102
    evidenceStore: ./evidence-store
  iso20022:
    inboxDir: ./connector/iso20022-adapter/inbox
    outboxDir: ./connector/iso20022-adapter/outbox
`;

describe("loadConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gold-custody-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses a well-formed config file", () => {
    const path = join(dir, "localnet.yaml");
    writeFileSync(path, VALID_YAML, "utf8");

    const config = loadConfig(path);

    expect(config.parties.custodian).toBe("Custodian");
    expect(config.parties.weighmaster).toBe("Weighmaster");
    expect(config.ledger.jsonApiUrl).toBe("http://localhost:7575");
    expect(config.business.maxOracleDivergenceBps).toBe(50);
    expect(config.connectors.navPublisher.port).toBe(8101);
    expect(config.connectors.navPublisher.xauSources).toHaveLength(2);
    expect(config.connectors.navPublisher.xauSources[0]).toEqual({
      type: "fixture",
      name: "fixture-primary",
      value: "2650.00",
    });
    expect(config.connectors.attestationService.port).toBe(8102);
    expect(config.connectors.iso20022.inboxDir).toBe("./connector/iso20022-adapter/inbox");
  });

  it("resolves config-relative paths against the repo root", () => {
    const configSubdir = join(dir, "config");
    mkdirSync(configSubdir, { recursive: true });
    const path = join(configSubdir, "localnet.yaml");
    // config.configDir === <dir>/config, so ".." brings us to <dir> (repo root).
    writeFileSync(path, VALID_YAML, "utf8");
    const loaded = loadConfig(path);

    const resolved = resolveConfigPath(loaded, "./connector/nav-publisher/fixtures/xau.json");
    expect(resolved).toBe(join(dir, "connector/nav-publisher/fixtures/xau.json"));
  });

  it("throws a descriptive error when a required section is missing", () => {
    const path = join(dir, "localnet.yaml");
    writeFileSync(path, "parties:\n  custodian: Custodian\n", "utf8");

    expect(() => loadConfig(path)).toThrow(/missing required section "ledger"/);
  });

  it("throws when navPublisher.xauSources is not an array", () => {
    const badYaml = VALID_YAML.replace(
      /xauSources:\n(.|\n)*?attestationService:/,
      "xauSources: not-an-array\n  attestationService:",
    );
    const path = join(dir, "localnet.yaml");
    writeFileSync(path, badYaml, "utf8");

    expect(() => loadConfig(path)).toThrow(/missing required array "xauSources"/);
  });
});
