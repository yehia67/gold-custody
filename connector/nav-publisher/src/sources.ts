import { readFile } from "node:fs/promises";
import type { XauSourceConfig } from "@gold-custody/shared";

/** A single XAU price source, e.g. a fixture value or a JSON file drop. */
export interface XauSource {
  readonly name: string;
  getValue(): Promise<number>;
}

/** Deterministic, in-memory source — useful for tests and as a always-on baseline. */
export class FixtureSource implements XauSource {
  readonly name: string;
  private readonly fixedValue: number;

  constructor(name: string, value: number) {
    this.name = name;
    this.fixedValue = value;
  }

  async getValue(): Promise<number> {
    return this.fixedValue;
  }
}

/** Reads `{ "value": number }` from a JSON file on every call (no caching, so file edits are picked up). */
export class JsonFileSource implements XauSource {
  readonly name: string;
  private readonly filePath: string;

  constructor(name: string, filePath: string) {
    this.name = name;
    this.filePath = filePath;
  }

  async getValue(): Promise<number> {
    const raw = await readFile(this.filePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`JsonFileSource "${this.name}": ${this.filePath} is not valid JSON (${(err as Error).message})`);
    }
    const value = (parsed as { value?: unknown } | null)?.value;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`JsonFileSource "${this.name}": expected a numeric "value" field in ${this.filePath}`);
    }
    return value;
  }
}

/** Builds a concrete XauSource from its config entry, resolving jsonFile paths against `resolvePath`. */
export function createXauSource(config: XauSourceConfig, resolvePath: (path: string) => string): XauSource {
  switch (config.type) {
    case "fixture": {
      if (config.value === undefined) {
        throw new Error(`Fixture XAU source "${config.name}" is missing "value"`);
      }
      const numeric = Number(config.value);
      if (!Number.isFinite(numeric)) {
        throw new Error(`Fixture XAU source "${config.name}" has a non-numeric value: ${config.value}`);
      }
      return new FixtureSource(config.name, numeric);
    }
    case "jsonFile": {
      if (config.path === undefined) {
        throw new Error(`jsonFile XAU source "${config.name}" is missing "path"`);
      }
      return new JsonFileSource(config.name, resolvePath(config.path));
    }
    default: {
      const exhaustive: never = config.type;
      throw new Error(`Unknown XAU source type: ${exhaustive as string}`);
    }
  }
}
