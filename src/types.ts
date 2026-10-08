/**
 * Public types for agent-eval.
 *
 * The harness is framework-agnostic: adapt your LangGraph, Vercel AI SDK,
 * or CrewAI agent into AgentFn and the runner does the rest.
 */

export interface ToolCall {
  name: string;
  args?: unknown;
}

/** What an adapted agent must return for one input. */
export interface AgentResult {
  output: string;
  toolCalls: ToolCall[];
  /** USD cost of this run, if your adapter can compute it. */
  costUsd?: number;
}

/** The agent under test, adapted to this contract. */
export type AgentFn = (input: string) => Promise<AgentResult>;

export interface JudgeVerdict {
  pass: boolean;
  reason?: string;
}

/** User-supplied judge. The library never calls a provider itself. */
export type JudgeFn = (
  output: string,
  evalCase: EvalCase
) => Promise<JudgeVerdict>;

export interface JudgeSpec {
  rubric: string;
}

/** One case from a YAML eval file. */
export interface EvalCase {
  name: string;
  input: string;
  /** Tools that must be called, in this order (ordered subset of actual calls). */
  expectTools?: string[];
  /** Tools that must never be called. */
  forbidTools?: string[];
  /** Each entry is a plain substring or a /regex/ with optional flags. */
  outputContains?: string[];
  outputNotContains?: string[];
  /** Fail when costUsd exceeds this. Missing costUsd fails when a cap is set. */
  maxCostUsd?: number;
  maxToolCalls?: number;
  judge?: JudgeSpec;
}

export interface AssertionFailure {
  assertion: string;
  expected: string;
  actual: string;
}

export interface EvalResult {
  name: string;
  pass: boolean;
  failures: AssertionFailure[];
  durationMs: number;
  costUsd?: number;
  /** Tool names in call order, kept for baseline diffs. */
  toolCalls: string[];
  /** Set when the agent itself threw. */
  error?: string;
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  totalCostUsd: number;
  totalDurationMs: number;
}

export interface RunEvalsOptions {
  judgeFn?: JudgeFn;
  signal?: AbortSignal;
  onCase?: (result: EvalResult) => void;
}

export interface RunEvalsOutput {
  results: EvalResult[];
  summary: EvalSummary;
}
