/**
 * JSONL result files and baseline diffing.
 *
 * A baseline is a JSONL file with one EvalResult per line. The first run
 * with --baseline writes it; later runs diff the current results against it
 * so CI can report new failures, fixed cases, and cost deltas.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { EvalResult } from "./types.js";

export function writeJsonl(path: string, results: EvalResult[]): void {
  const text = results.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(path, text, "utf-8");
}

export function readJsonl(path: string): EvalResult[] {
  const text = readFileSync(path, "utf-8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => {
      try {
        return JSON.parse(line) as EvalResult;
      } catch {
        throw new Error(`agent-eval: invalid JSON on line ${i + 1} of ${path}`);
      }
    });
}

export interface BaselineDiff {
  /** Cases failing now that passed (or are new) in the baseline. */
  newFailures: string[];
  /** Cases failing in the baseline that pass now. */
  fixed: string[];
  /** Cases failing in both runs. */
  stillFailing: string[];
  /** Per-case cost changes, only when both sides reported a cost. */
  costDeltas: Array<{ name: string; before?: number; after?: number; delta?: number }>;
}

export function diffBaseline(
  baseline: EvalResult[],
  current: EvalResult[]
): BaselineDiff {
  const before = new Map(baseline.map((r) => [r.name, r]));
  const diff: BaselineDiff = {
    newFailures: [],
    fixed: [],
    stillFailing: [],
    costDeltas: []
  };
  for (const cur of current) {
    const prev = before.get(cur.name);
    if (!cur.pass && (!prev || prev.pass)) diff.newFailures.push(cur.name);
    if (cur.pass && prev && !prev.pass) diff.fixed.push(cur.name);
    if (!cur.pass && prev && !prev.pass) diff.stillFailing.push(cur.name);
    if (prev && prev.costUsd !== undefined && cur.costUsd !== undefined) {
      diff.costDeltas.push({
        name: cur.name,
        before: prev.costUsd,
        after: cur.costUsd,
        delta: round(cur.costUsd - prev.costUsd)
      });
    }
  }
  return diff;
}

function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
