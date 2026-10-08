/**
 * agent-eval: your agent will break in production. Catch it in CI.
 *
 * Tiny YAML eval harness for AI agents: declare inputs, expected tools,
 * and cost caps; get a nonzero exit when the agent misbehaves.
 */
export { loadCases } from "./yaml.js";
export { checkCase, compileMatcher, isOrderedSubset } from "./assertions.js";
export { runEvals, summarize, exitCodeForSummary } from "./runner.js";
export { writeJsonl, readJsonl, diffBaseline } from "./jsonl.js";
export type { BaselineDiff } from "./jsonl.js";
export type {
  ToolCall,
  AgentResult,
  AgentFn,
  JudgeVerdict,
  JudgeFn,
  JudgeSpec,
  EvalCase,
  AssertionFailure,
  EvalResult,
  EvalSummary,
  RunEvalsOptions,
  RunEvalsOutput
} from "./types.js";
