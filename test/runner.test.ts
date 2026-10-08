import { describe, expect, it, vi } from "vitest";
import { exitCodeForSummary, runEvals, summarize } from "../src/runner.js";
import type { AgentFn, EvalCase, EvalResult } from "../src/types.js";

const cases: EvalCase[] = [
  { name: "one", input: "a", outputContains: ["ok"] },
  { name: "two", input: "b", forbidTools: ["evil"] }
];

const goodAgent: AgentFn = async (input) => ({
  output: `ok ${input}`,
  toolCalls: [{ name: "safe" }],
  costUsd: 0.01
});

describe("runEvals", () => {
  it("passes every case against a well-behaved agent", async () => {
    const { results, summary } = await runEvals(cases, goodAgent);
    expect(results.every((r) => r.pass)).toBe(true);
    expect(summary).toMatchObject({ total: 2, passed: 2, failed: 0 });
    expect(summary.totalCostUsd).toBeCloseTo(0.02);
  });

  it("records failures with assertion details", async () => {
    const bad: AgentFn = async () => ({
      output: "nope",
      toolCalls: [{ name: "evil" }]
    });
    const { results, summary } = await runEvals(cases, bad);
    expect(summary.failed).toBe(2);
    expect(results[0]?.failures[0]?.assertion).toBe("output_contains");
    expect(results[1]?.failures[0]?.assertion).toBe("forbid_tools");
  });

  it("captures agent throws as agent_error", async () => {
    const throwing: AgentFn = async () => {
      throw new Error("boom");
    };
    const { results } = await runEvals([cases[0] as EvalCase], throwing);
    expect(results[0]?.pass).toBe(false);
    expect(results[0]?.failures[0]?.assertion).toBe("agent_error");
    expect(results[0]?.error).toBe("boom");
  });

  it("calls onCase for each result and aborts on signal", async () => {
    const onCase = vi.fn();
    await runEvals(cases, goodAgent, { onCase });
    expect(onCase).toHaveBeenCalledTimes(2);
    const controller = new AbortController();
    controller.abort();
    await expect(runEvals(cases, goodAgent, { signal: controller.signal })).rejects.toThrow(
      "aborted"
    );
  });
});

describe("summarize and exitCodeForSummary", () => {
  const r = (pass: boolean): EvalResult => ({
    name: "x",
    pass,
    failures: [],
    durationMs: 5,
    toolCalls: []
  });

  it("maps failed count to exit code", () => {
    expect(exitCodeForSummary(summarize([r(true), r(true)]))).toBe(0);
    expect(exitCodeForSummary(summarize([r(true), r(false)]))).toBe(1);
    expect(exitCodeForSummary(summarize([]))).toBe(0);
  });
});
