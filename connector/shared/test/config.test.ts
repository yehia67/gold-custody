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
  mode: mock

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
    host: 127.0.0.1
    xauSources:
      - type: fixture
        name: fixture-primary
        value: "2650.00"
      - type: jsonFile
        name: file-secondary
        path: ./connector/nav-publisher/fixtures/xau.json
  attestationService:
    port: 8102
    host: 127.0.0.1
    evidenceStore: ./evidence-store
    apiKey: local-dev-key
    weightCosignTtlSeconds: 3600
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
    expect(config.connectors.attestationService.apiKey).toBe("local-dev-key");
    expect(config.connectors.attestationService.weightCosignTtlSeconds).toBe(3600);
    expect(config.connectors.navPublisher.host).toBe("127.0.0.1");
    expect(config.ledger.mode).toBe("mock");
    expect(config.connectors.iso20022.inboxDir).toBe("./connector/iso20022-adapter/inbox");
  });

  it("defaults host, ledger.mode, and weightCosignTtlSeconds when omitted", () => {
    const path = join(dir, "localnet.yaml");
    const yamlWithoutDefaults = VALID_YAML.replace("host: 127.0.0.1\n    xauSources:", "xauSources:")
      .replace("    host: 127.0.0.1\n    evidenceStore:", "    evidenceStore:")
      .replace("    weightCosignTtlSeconds: 3600\n", "")
      .replace("  mode: mock\n", "");
    writeFileSync(path, yamlWithoutDefaults, "utf8");

    const config = loadConfig(path);

    expect(config.ledger.mode).toBe("mock");
    expect(config.connectors.navPublisher.host).toBe("127.0.0.1");
    expect(config.connectors.attestationService.host).toBe("127.0.0.1");
    expect(config.connectors.attestationService.weightCosignTtlSeconds).toBe(3600);
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

    expect(() => loadConfig(path)).toThrow(/ledger/);
  });

  it("throws when navPublisher.xauSources is not an array", () => {
    const badYaml = VALID_YAML.replace(
      /xauSources:\n(.|\n)*?attestationService:/,
      "xauSources: not-an-array\n  attestationService:",
    );
    const path = join(dir, "localnet.yaml");
    writeFileSync(path, badYaml, "utf8");

    expect(() => loadConfig(path)).toThrow(/xauSources/);
  });

  it("rejects a non-numeric port via zod validation", () => {
    const badYaml = VALID_YAML.replace("port: 8101", 'port: "not-a-port"');
    const path = join(dir, "localnet.yaml");
    writeFileSync(path, badYaml, "utf8");

    expect(() => loadConfig(path)).toThrow(/Invalid config/);
    expect(() => loadConfig(path)).toThrow(/port/);
  });

  it("rejects a port outside the valid 1-65535 range", () => {
    const badYaml = VALID_YAML.replace("port: 8102", "port: 70000");
    const path = join(dir, "localnet.yaml");
    writeFileSync(path, badYaml, "utf8");

    expect(() => loadConfig(path)).toThrow(/port/);
  });

  it("rejects a config missing attestationService.apiKey", () => {
    const badYaml = VALID_YAML.replace("    apiKey: local-dev-key\n", "");
    const path = join(dir, "localnet.yaml");
    writeFileSync(path, badYaml, "utf8");

    expect(() => loadConfig(path)).toThrow(/apiKey/);
  });

  it("rejects an empty party string", () => {
    const badYaml = VALID_YAML.replace("custodian: Custodian", 'custodian: ""');
    const path = join(dir, "localnet.yaml");
    writeFileSync(path, badYaml, "utf8");

    expect(() => loadConfig(path)).toThrow(/parties.custodian/);
  });

  it("rejects an unrecognized ledger.mode value", () => {
    const badYaml = VALID_YAML.replace("mode: mock", "mode: bogus");
    const path = join(dir, "localnet.yaml");
    writeFileSync(path, badYaml, "utf8");

    expect(() => loadConfig(path)).toThrow(/mode/);
  });

  it("rejects an xauSources fixture entry missing its value field", () => {
    const badYaml = VALID_YAML.replace('        value: "2650.00"\n', "");
    const path = join(dir, "localnet.yaml");
    writeFileSync(path, badYaml, "utf8");

    expect(() => loadConfig(path)).toThrow(/xauSources/);
  });
});
