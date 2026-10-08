/**
 * The eval runner: execute every case against the agent, collect results.
 */
import { checkCase } from "./assertions.js";
import type {
  AgentFn,
  EvalCase,
  EvalResult,
  EvalSummary,
  RunEvalsOptions,
  RunEvalsOutput
} from "./types.js";

export async function runEvals(
  cases: EvalCase[],
  agent: AgentFn,
  options: RunEvalsOptions = {}
): Promise<RunEvalsOutput> {
  const results: EvalResult[] = [];

  for (const evalCase of cases) {
    if (options.signal?.aborted) {
      throw abortError();
    }
    const started = Date.now();
    let result: EvalResult;
    try {
      const agentResult = await agent(evalCase.input);
      const failures = await checkCase(evalCase, agentResult, options.judgeFn);
      result = {
        name: evalCase.name,
        pass: failures.length === 0,
        failures,
        durationMs: Date.now() - started,
        toolCalls: agentResult.toolCalls.map((t) => t.name)
      };
      if (agentResult.costUsd !== undefined) result.costUsd = agentResult.costUsd;
    } catch (err) {
      result = {
        name: evalCase.name,
        pass: false,
        failures: [
          {
            assertion: "agent_error",
            expected: "agent returns a result",
            actual: err instanceof Error ? err.message : String(err)
          }
        ],
        durationMs: Date.now() - started,
        toolCalls: [],
        error: err instanceof Error ? err.message : String(err)
      };
    }
    results.push(result);
    options.onCase?.(result);
  }

  return { results, summary: summarize(results) };
}

export function summarize(results: EvalResult[]): EvalSummary {
  const failed = results.filter((r) => !r.pass).length;
  return {
    total: results.length,
    passed: results.length - failed,
    failed,
    totalCostUsd: results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0)
  };
}

/** CLI exit code: 1 when anything failed, 0 otherwise. */
export function exitCodeForSummary(summary: EvalSummary): number {
  return summary.failed > 0 ? 1 : 0;
}

function abortError(): Error {
  const err = new Error("The eval run was aborted.");
  err.name = "AbortError";
  return err;
}
