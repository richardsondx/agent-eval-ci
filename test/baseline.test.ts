import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diffBaseline, readJsonl, writeJsonl } from "../src/jsonl.js";
import type { EvalResult } from "../src/types.js";

let dir = "";
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

const r = (name: string, pass: boolean, costUsd?: number): EvalResult => ({
  name,
  pass,
  failures: pass ? [] : [{ assertion: "output_contains", expected: "x", actual: "y" }],
  durationMs: 10,
  toolCalls: ["get_order"],
  ...(costUsd !== undefined ? { costUsd } : {})
});

describe("jsonl", () => {
  it("round-trips results through JSONL", () => {
    dir = mkdtempSync(join(tmpdir(), "jsonl-"));
    const path = join(dir, "out.jsonl");
    const results = [r("a", true, 0.01), r("b", false)];
    writeJsonl(path, results);
    expect(readJsonl(path)).toEqual(results);
  });

  it("rejects malformed lines", () => {
    dir = mkdtempSync(join(tmpdir(), "jsonl-"));
    const path = join(dir, "bad.jsonl");
    writeJsonl(path, [r("a", true)]);
    appendFileSync(path, "not json\n");
    expect(() => readJsonl(path)).toThrow("line 2");
  });
});

describe("diffBaseline", () => {
  it("finds new failures, fixed cases, still-failing, and cost deltas", () => {
    const baseline = [
      r("new-fail", true, 0.01),
      r("fixed", false, 0.02),
      r("still-bad", false),
      r("fine", true, 0.03)
    ];
    const current = [
      r("new-fail", false, 0.05),
      r("fixed", true, 0.02),
      r("still-bad", false),
      r("fine", true, 0.03),
      r("brand-new", false)
    ];
    const diff = diffBaseline(baseline, current);
    expect(diff.newFailures.sort()).toEqual(["brand-new", "new-fail"]);
    expect(diff.fixed).toEqual(["fixed"]);
    expect(diff.stillFailing).toEqual(["still-bad"]);
    const delta = diff.costDeltas.find((d) => d.name === "new-fail");
    expect(delta).toMatchObject({ before: 0.01, after: 0.05, delta: 0.04 });
  });

  it("skips cost deltas when either side did not report cost", () => {
    const diff = diffBaseline([r("a", true)], [r("a", true, 0.01)]);
    expect(diff.costDeltas).toEqual([]);
  });
});
