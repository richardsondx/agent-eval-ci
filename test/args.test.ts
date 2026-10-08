import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadFn, parseArgs } from "../src/args.js";

let dir = "";
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

describe("parseArgs", () => {
  it("parses the full run command", () => {
    const args = parseArgs([
      "node",
      "agent-eval-ci",
      "run",
      "--agent",
      "./agent.js",
      "--evals",
      "./evals/",
      "--baseline",
      "./b.jsonl",
      "--update-baseline",
      "--json"
    ]);
    expect(args).toMatchObject({
      command: "run",
      agent: "./agent.js",
      evals: "./evals/",
      baseline: "./b.jsonl",
      updateBaseline: true,
      json: true
    });
  });

  it("rejects unknown flags and missing values", () => {
    expect(() => parseArgs(["node", "x", "run", "--nope"])).toThrow("unknown flag");
    expect(() => parseArgs(["node", "x", "run", "--agent"])).toThrow("requires a value");
    expect(() => parseArgs(["node", "x", "run", "--agent", "--evals"])).toThrow(
      "requires a value"
    );
  });
});

describe("loadFn", () => {
  it("loads a default-exported function from a JS module", async () => {
    dir = mkdtempSync(join(tmpdir(), "mod-"));
    const path = join(dir, "agent.mjs");
    writeFileSync(path, "export default async (input) => ({ output: input, toolCalls: [] });");
    const fn = await loadFn<(i: string) => Promise<unknown>>(path, "agent");
    expect(typeof fn).toBe("function");
  });

  it("rejects modules without a function export", async () => {
    dir = mkdtempSync(join(tmpdir(), "mod-"));
    const path = join(dir, "bad.mjs");
    writeFileSync(path, "export default 42;");
    await expect(loadFn(path, "agent")).rejects.toThrow("must export a function");
  });
});
