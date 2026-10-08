import { describe, expect, it, vi } from "vitest";
import {
  checkCase,
  compileMatcher,
  isOrderedSubset
} from "../src/assertions.js";
import type { AgentResult, EvalCase } from "../src/types.js";

const base: EvalCase = { name: "c", input: "i" };
const result = (over: Partial<AgentResult> = {}): AgentResult => ({
  output: "Your order 123 has shipped.",
  toolCalls: [{ name: "get_order" }],
  ...over
});

describe("isOrderedSubset", () => {
  it.each([
    [["a"], ["a", "b"], true],
    [["a", "c"], ["a", "b", "c"], true],
    [["c", "a"], ["a", "b", "c"], false],
    [["z"], ["a", "b"], false],
    [[], ["a"], true]
  ])("expect %j in %j -> %s", (expected, actual, pass) => {
    expect(isOrderedSubset(expected, actual)).toBe(pass);
  });
});

describe("compileMatcher", () => {
  it("matches plain substrings", () => {
    expect(compileMatcher("shipped")("it shipped")).toBe(true);
    expect(compileMatcher("shipped")("it arrived")).toBe(false);
  });
  it("matches /regex/ with flags", () => {
    expect(compileMatcher("/order \\d+/")("order 123")).toBe(true);
    expect(compileMatcher("/SHIPPED/i")("shipped")).toBe(true);
  });
  it("treats slash strings without valid flags as plain text", () => {
    expect(compileMatcher("/api/v1")("see /api/v1 docs")).toBe(true);
  });
});

describe("checkCase", () => {
  it("passes a fully satisfied case", async () => {
    const failures = await checkCase(
      {
        ...base,
        expectTools: ["get_order"],
        forbidTools: ["refund_order"],
        outputContains: ["shipped"],
        outputNotContains: ["sorry"],
        maxCostUsd: 0.05,
        maxToolCalls: 5
      },
      result({ costUsd: 0.01 })
    );
    expect(failures).toEqual([]);
  });

  it("fails expect_tools when the order is wrong", async () => {
    const failures = await checkCase(
      { ...base, expectTools: ["get_order", "search"] },
      result({ toolCalls: [{ name: "search" }, { name: "get_order" }] })
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.assertion).toBe("expect_tools");
  });

  it("fails forbid_tools when a forbidden tool runs", async () => {
    const failures = await checkCase(
      { ...base, forbidTools: ["refund_order"] },
      result({ toolCalls: [{ name: "refund_order" }] })
    );
    expect(failures[0]?.assertion).toBe("forbid_tools");
  });

  it("fails output_contains and output_not_contains", async () => {
    const f1 = await checkCase(
      { ...base, outputContains: ["/delivered/"] },
      result()
    );
    expect(f1[0]?.assertion).toBe("output_contains");
    const f2 = await checkCase(
      { ...base, outputNotContains: ["shipped"] },
      result()
    );
    expect(f2[0]?.assertion).toBe("output_not_contains");
  });

  it("fails max_cost_usd when over cap, and when cost is unreported", async () => {
    const over = await checkCase({ ...base, maxCostUsd: 0.01 }, result({ costUsd: 0.05 }));
    expect(over[0]?.assertion).toBe("max_cost_usd");
    const missing = await checkCase({ ...base, maxCostUsd: 0.01 }, result());
    expect(missing[0]?.assertion).toBe("max_cost_usd");
    expect(missing[0]?.actual).toMatch("did not report");
  });

  it("fails max_tool_calls when exceeded", async () => {
    const failures = await checkCase(
      { ...base, maxToolCalls: 1 },
      result({ toolCalls: [{ name: "a" }, { name: "b" }] })
    );
    expect(failures[0]?.assertion).toBe("max_tool_calls");
  });

  it("runs the judge when supplied", async () => {
    const judgeFn = vi.fn(async () => ({ pass: false, reason: "too rude" }));
    const failures = await checkCase(
      { ...base, judge: { rubric: "Be polite." } },
      result(),
      judgeFn
    );
    expect(failures[0]?.assertion).toBe("judge");
    expect(failures[0]?.actual).toBe("too rude");
    expect(judgeFn).toHaveBeenCalledWith(result().output, expect.objectContaining({ name: "c" }));
  });

  it("fails when a judge is required but no judgeFn is given", async () => {
    const failures = await checkCase(
      { ...base, judge: { rubric: "Be polite." } },
      result()
    );
    expect(failures[0]?.assertion).toBe("judge");
  });

  it("collects multiple failures at once", async () => {
    const failures = await checkCase(
      { ...base, forbidTools: ["get_order"], outputContains: ["delivered"] },
      result()
    );
    expect(failures.map((f) => f.assertion).sort()).toEqual([
      "forbid_tools",
      "output_contains"
    ]);
  });
});
