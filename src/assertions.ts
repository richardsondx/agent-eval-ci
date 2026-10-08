/**
 * Assertion checks for one case against one agent result.
 *
 * expect_tools is an ordered subset: the expected tools must appear in the
 * actual call sequence in the same order, with other calls allowed between.
 */
import type {
  AgentResult,
  AssertionFailure,
  EvalCase,
  JudgeFn
} from "./types.js";

/** Compile a matcher: /regex/flags or a plain substring. */
export function compileMatcher(raw: string): (output: string) => boolean {
  const m = /^\/(.*)\/([a-z]*)$/.exec(raw);
  if (m) {
    const re = new RegExp(m[1] as string, m[2] as string);
    return (output: string) => re.test(output);
  }
  return (output: string) => output.includes(raw);
}

/** True when `expected` appears in `actual` in order (subsequence). */
export function isOrderedSubset(expected: string[], actual: string[]): boolean {
  let i = 0;
  for (const name of actual) {
    if (i < expected.length && name === expected[i]) i++;
  }
  return i === expected.length;
}

export async function checkCase(
  evalCase: EvalCase,
  result: AgentResult,
  judgeFn?: JudgeFn
): Promise<AssertionFailure[]> {
  const failures: AssertionFailure[] = [];
  const actualTools = result.toolCalls.map((t) => t.name);

  if (evalCase.expectTools && evalCase.expectTools.length > 0) {
    if (!isOrderedSubset(evalCase.expectTools, actualTools)) {
      failures.push({
        assertion: "expect_tools",
        expected: `tools called in order: ${evalCase.expectTools.join(" -> ")}`,
        actual: `tools called: ${actualTools.join(", ") || "(none)"}`
      });
    }
  }

  if (evalCase.forbidTools) {
    const hit = evalCase.forbidTools.filter((t) => actualTools.includes(t));
    if (hit.length > 0) {
      failures.push({
        assertion: "forbid_tools",
        expected: `never call: ${evalCase.forbidTools.join(", ")}`,
        actual: `called: ${hit.join(", ")}`
      });
    }
  }

  if (evalCase.outputContains) {
    for (const raw of evalCase.outputContains) {
      if (!compileMatcher(raw)(result.output)) {
        failures.push({
          assertion: "output_contains",
          expected: `output matches ${raw}`,
          actual: truncate(result.output)
        });
      }
    }
  }

  if (evalCase.outputNotContains) {
    for (const raw of evalCase.outputNotContains) {
      if (compileMatcher(raw)(result.output)) {
        failures.push({
          assertion: "output_not_contains",
          expected: `output does not match ${raw}`,
          actual: truncate(result.output)
        });
      }
    }
  }

  if (evalCase.maxToolCalls !== undefined) {
    if (actualTools.length > evalCase.maxToolCalls) {
      failures.push({
        assertion: "max_tool_calls",
        expected: `at most ${evalCase.maxToolCalls} tool calls`,
        actual: `${actualTools.length} tool calls`
      });
    }
  }

  if (evalCase.maxCostUsd !== undefined) {
    if (result.costUsd === undefined) {
      failures.push({
        assertion: "max_cost_usd",
        expected: `cost reported and at most $${evalCase.maxCostUsd}`,
        actual: "agent did not report costUsd"
      });
    } else if (result.costUsd > evalCase.maxCostUsd) {
      failures.push({
        assertion: "max_cost_usd",
        expected: `at most $${evalCase.maxCostUsd}`,
        actual: `$${result.costUsd}`
      });
    }
  }

  if (evalCase.judge) {
    if (!judgeFn) {
      failures.push({
        assertion: "judge",
        expected: "a judgeFn was provided",
        actual: "case requires a judge but no judgeFn was supplied"
      });
    } else {
      const verdict = await judgeFn(result.output, evalCase);
      if (!verdict.pass) {
        failures.push({
          assertion: "judge",
          expected: evalCase.judge.rubric,
          actual: verdict.reason ?? "judge returned pass: false"
        });
      }
    }
  }

  return failures;
}

function truncate(s: string, max = 200): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
