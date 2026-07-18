import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export interface PartiesConfig {
  systemOperator: string;
  custodian: string;
  regulator: string;
  fundManager: string;
  registrar: string;
  investor1: string;
  investor2: string;
  oracleOperator1: string;
  oracleOperator2: string;
  navAgent: string;
  weighmaster: string;
  weighDevice: string;
  assayer: string;
  transporter: string;
  auditor: string;
  complianceProvider: string;
  vaultKeeper: string;
  cashIssuer: string;
}

export interface LedgerEndpointConfig {
  jsonApiUrl: string;
  grpcHost: string;
  grpcPort: number;
  cnQuickstartPath: string;
}

export interface BusinessConfig {
  minPurity: string;
  attestationMaxAgeSeconds: number;
  assayValiditySeconds: number;
  navValiditySeconds: number;
  escrowDefaultExpirySeconds: number;
  maxOracleDivergenceBps: number;
  proofOfReserveMaxAgeSeconds: number;
  gramsPerUnit: string;
  weightMatchToleranceGrams: string;
  inKindRedemptionThresholdGrams: string;
  defaultTransferLimit: string;
  defaultFeeBps: number;
  navPublishIntervalSeconds: number;
}

export type XauSourceType = "fixture" | "jsonFile";

export interface XauSourceConfig {
  type: XauSourceType;
  name: string;
  /** Required when type === "fixture"; a decimal string, e.g. "2650.00". */
  value?: string;
  /** Required when type === "jsonFile"; path to a `{ "value": number }` file, resolved relative to the repo root. */
  path?: string;
}

export interface NavPublisherConfig {
  port: number;
  xauSources: XauSourceConfig[];
}

export interface AttestationServiceConfig {
  port: number;
  evidenceStore: string;
}

export interface Iso20022ConnectorConfig {
  inboxDir: string;
  outboxDir: string;
}

export interface ConnectorsConfig {
  navPublisher: NavPublisherConfig;
  attestationService: AttestationServiceConfig;
  iso20022: Iso20022ConnectorConfig;
}

export interface GoldCustodyConfig {
  parties: PartiesConfig;
  ledger: LedgerEndpointConfig;
  business: BusinessConfig;
  connectors: ConnectorsConfig;
  /** Absolute directory the config file was loaded from; used to resolve relative paths in the config. */
  readonly configDir: string;
}

class ConfigValidationError extends Error {
  constructor(path: string, message: string) {
    super(`Invalid config at ${path}: ${message}`);
    this.name = "ConfigValidationError";
  }
}

function requireSection<T>(raw: Record<string, unknown>, key: string, path: string): T {
  const value = raw[key];
  if (value === undefined || value === null || typeof value !== "object") {
    throw new ConfigValidationError(path, `missing required section "${key}"`);
  }
  return value as T;
}

function requireArray<T>(raw: Record<string, unknown>, key: string, path: string): T[] {
  const value = raw[key];
  if (!Array.isArray(value)) {
    throw new ConfigValidationError(path, `missing required array "${key}"`);
  }
  return value as T[];
}

/**
 * Loads and validates the gold-custody YAML config (e.g. config/localnet.yaml).
 * All connector business logic reads ports, party ids, and business thresholds
 * from the object returned here rather than hardcoding them.
 */
export function loadConfig(path: string): GoldCustodyConfig {
  const raw = readFileSync(path, "utf8");
  const parsed = parse(raw) as Record<string, unknown>;
  if (parsed === null || typeof parsed !== "object") {
    throw new ConfigValidationError(path, "root document must be a mapping");
  }

  const parties = requireSection<PartiesConfig>(parsed, "parties", path);
  const ledger = requireSection<LedgerEndpointConfig>(parsed, "ledger", path);
  const business = requireSection<BusinessConfig>(parsed, "business", path);
  const connectors = requireSection<Record<string, unknown>>(parsed, "connectors", path);

  const navPublisher = requireSection<Omit<NavPublisherConfig, "xauSources">>(
    connectors,
    "navPublisher",
    path,
  );
  const xauSources = requireArray<XauSourceConfig>(
    connectors.navPublisher as Record<string, unknown>,
    "xauSources",
    path,
  );
  const attestationService = requireSection<AttestationServiceConfig>(
    connectors,
    "attestationService",
    path,
  );
  const iso20022 = requireSection<Iso20022ConnectorConfig>(connectors, "iso20022", path);

  return {
    parties,
    ledger,
    business,
    connectors: {
      navPublisher: { ...navPublisher, xauSources },
      attestationService,
      iso20022,
    },
    configDir: join(path, ".."),
  };
}

/**
 * Resolves a path from the config file that may be relative (to the repo
 * root, since config/localnet.yaml paths such as
 * "./connector/nav-publisher/fixtures/xau.json" are written relative to the
 * repo root, not to config/) into an absolute path.
 */
export function resolveConfigPath(config: GoldCustodyConfig, relativeOrAbsolute: string): string {
  if (relativeOrAbsolute.startsWith("/")) {
    return relativeOrAbsolute;
  }
  return join(config.configDir, "..", relativeOrAbsolute);
}

/**
 * Default location of config/localnet.yaml, computed relative to this
 * package's install location (connector/shared) so services never hardcode
 * a path into business logic; overridable via GOLD_CUSTODY_CONFIG_PATH.
 */
export function defaultConfigPath(): string {
  return process.env.GOLD_CUSTODY_CONFIG_PATH ?? join(__dirname, "..", "..", "..", "config", "localnet.yaml");
}
