import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

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

/** `mock` (default) drives every connector's standalone/unit wiring with MockLedgerClient; `live` requires JsonLedgerClient. */
export const LEDGER_MODES = ["mock", "live"] as const;
export type LedgerMode = (typeof LEDGER_MODES)[number];

export interface LedgerEndpointConfig {
  jsonApiUrl: string;
  grpcHost: string;
  grpcPort: number;
  cnQuickstartPath: string;
  mode: LedgerMode;
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
  /** Bind address for the healthz HTTP server; defaults to loopback-only. */
  host: string;
  xauSources: XauSourceConfig[];
}

export interface AttestationServiceConfig {
  port: number;
  /** Bind address for the HTTP server; defaults to loopback-only. */
  host: string;
  evidenceStore: string;
  /** Required value of the `X-API-Key` request header on every request but /healthz. */
  apiKey: string;
  /** How long a lone Weight attestation half is retained awaiting its co-signature before eviction. */
  weightCosignTtlSeconds: number;
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

export class ConfigValidationError extends Error {
  constructor(path: string, message: string) {
    super(`Invalid config at ${path}: ${message}`);
    this.name = "ConfigValidationError";
  }
}

const partyId = () => z.string().trim().min(1, "must be a non-empty party id");
const port = () => z.number().int().min(1).max(65535);
const posInt = () => z.number().int().positive();
const nonNegInt = () => z.number().int().nonnegative();
const decimalString = () => z.string().trim().min(1);

/**
 * Runtime validation schema for the gold-custody YAML config. Field-level
 * checks (port ranges, non-empty party ids, business thresholds, the
 * xauSources discriminated union, etc.) replace the old "cast the parsed
 * YAML to the expected TypeScript type and hope" approach: every field is
 * actually checked before GoldCustodyConfig is handed to business logic.
 *
 * NOTE: the exported TypeScript types above are hand-written (not
 * z.infer<...>) because the installed TypeScript 7.x preview does not
 * reliably narrow discriminated-union member types inferred through zod's
 * ZodDiscriminatedUnion (verified: switch/exhaustiveness checks on the
 * inferred type silently degrade to `any`). The zod schema below is kept
 * structurally identical to those hand-written types.
 */
const GoldCustodyConfigSchema = z.object({
  parties: z.object({
    systemOperator: partyId(),
    custodian: partyId(),
    regulator: partyId(),
    fundManager: partyId(),
    registrar: partyId(),
    investor1: partyId(),
    investor2: partyId(),
    oracleOperator1: partyId(),
    oracleOperator2: partyId(),
    navAgent: partyId(),
    weighmaster: partyId(),
    weighDevice: partyId(),
    assayer: partyId(),
    transporter: partyId(),
    auditor: partyId(),
    complianceProvider: partyId(),
    vaultKeeper: partyId(),
    cashIssuer: partyId(),
  }),
  ledger: z.object({
    jsonApiUrl: z.string().trim().min(1),
    grpcHost: z.string().trim().min(1),
    grpcPort: port(),
    cnQuickstartPath: z.string().trim().min(1),
    mode: z.enum(LEDGER_MODES).default("mock"),
  }),
  business: z.object({
    minPurity: decimalString(),
    attestationMaxAgeSeconds: posInt(),
    assayValiditySeconds: posInt(),
    navValiditySeconds: posInt(),
    escrowDefaultExpirySeconds: posInt(),
    maxOracleDivergenceBps: nonNegInt(),
    proofOfReserveMaxAgeSeconds: posInt(),
    gramsPerUnit: decimalString(),
    weightMatchToleranceGrams: decimalString(),
    inKindRedemptionThresholdGrams: decimalString(),
    defaultTransferLimit: decimalString(),
    defaultFeeBps: nonNegInt(),
    navPublishIntervalSeconds: posInt(),
  }),
  connectors: z.object({
    navPublisher: z.object({
      port: port(),
      host: z.string().trim().min(1).default("127.0.0.1"),
      xauSources: z
        .array(
          z.discriminatedUnion("type", [
            z.object({ type: z.literal("fixture"), name: z.string().trim().min(1), value: z.string().trim().min(1) }),
            z.object({ type: z.literal("jsonFile"), name: z.string().trim().min(1), path: z.string().trim().min(1) }),
          ]),
        )
        .min(1, "at least one XAU source is required"),
    }),
    attestationService: z.object({
      port: port(),
      host: z.string().trim().min(1).default("127.0.0.1"),
      evidenceStore: z.string().trim().min(1),
      apiKey: z.string().min(1, "attestationService.apiKey must be set (see config/localnet.yaml)"),
      weightCosignTtlSeconds: posInt().default(3600),
    }),
    iso20022: z.object({
      inboxDir: z.string().trim().min(1),
      outboxDir: z.string().trim().min(1),
    }),
  }),
});

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Loads and validates the gold-custody YAML config (e.g. config/localnet.yaml)
 * against GoldCustodyConfigSchema (zod). All connector business logic reads
 * ports, party ids, and business thresholds from the object returned here
 * rather than hardcoding them or trusting unvalidated YAML casts.
 */
export function loadConfig(path: string): GoldCustodyConfig {
  const raw = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    throw new ConfigValidationError(path, `not valid YAML (${(err as Error).message})`);
  }

  const result = GoldCustodyConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigValidationError(path, formatZodError(result.error));
  }

  // Safe: result.data was just validated field-by-field against
  // GoldCustodyConfigSchema, which mirrors GoldCustodyConfig exactly (see
  // note above on why this isn't expressed as z.infer<...> directly).
  return {
    ...(result.data as unknown as Omit<GoldCustodyConfig, "configDir">),
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
