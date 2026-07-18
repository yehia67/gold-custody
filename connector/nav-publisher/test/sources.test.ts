import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createXauSource, FixtureSource, JsonFileSource } from "../src/sources";

describe("FixtureSource", () => {
  it("always returns its configured value", async () => {
    const source = new FixtureSource("fixture-primary", 2650);
    await expect(source.getValue()).resolves.toBe(2650);
    await expect(source.getValue()).resolves.toBe(2650);
  });
});

describe("JsonFileSource", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gold-custody-xau-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads the numeric value field from a JSON file", async () => {
    const filePath = join(dir, "xau.json");
    writeFileSync(filePath, JSON.stringify({ value: 2651.25 }), "utf8");

    const source = new JsonFileSource("file-secondary", filePath);
    await expect(source.getValue()).resolves.toBe(2651.25);
  });

  it("re-reads the file on every call, picking up edits", async () => {
    const filePath = join(dir, "xau.json");
    writeFileSync(filePath, JSON.stringify({ value: 100 }), "utf8");
    const source = new JsonFileSource("file-secondary", filePath);
    await expect(source.getValue()).resolves.toBe(100);

    writeFileSync(filePath, JSON.stringify({ value: 200 }), "utf8");
    await expect(source.getValue()).resolves.toBe(200);
  });

  it("rejects malformed JSON", async () => {
    const filePath = join(dir, "xau.json");
    writeFileSync(filePath, "not json", "utf8");

    const source = new JsonFileSource("file-secondary", filePath);
    await expect(source.getValue()).rejects.toThrow(/not valid JSON/);
  });

  it("rejects a file missing the numeric value field", async () => {
    const filePath = join(dir, "xau.json");
    writeFileSync(filePath, JSON.stringify({ notValue: 123 }), "utf8");

    const source = new JsonFileSource("file-secondary", filePath);
    await expect(source.getValue()).rejects.toThrow(/expected a numeric "value" field/);
  });
});

describe("createXauSource", () => {
  it("builds a FixtureSource from a fixture config entry", async () => {
    const source = createXauSource(
      { type: "fixture", name: "fixture-primary", value: "2650.00" },
      (p) => p,
    );
    expect(source).toBeInstanceOf(FixtureSource);
    await expect(source.getValue()).resolves.toBe(2650);
  });

  it("builds a JsonFileSource from a jsonFile config entry, resolving its path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gold-custody-xau-"));
    const filePath = join(dir, "xau.json");
    writeFileSync(filePath, JSON.stringify({ value: 42 }), "utf8");

    const source = createXauSource(
      { type: "jsonFile", name: "file-secondary", path: "xau.json" },
      () => filePath,
    );
    expect(source).toBeInstanceOf(JsonFileSource);
    await expect(source.getValue()).resolves.toBe(42);

    rmSync(dir, { recursive: true, force: true });
  });

  it("throws for an unknown source type", () => {
    expect(() =>
      createXauSource({ type: "bogus" as never, name: "x" }, (p) => p),
    ).toThrow(/Unknown XAU source type/);
  });
});
