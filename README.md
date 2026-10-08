# agent-eval-ci

**Your agent will break in production. Catch it in CI.**

`agent-eval` is a tiny YAML eval harness for AI agents. Declare inputs, expected tools, and cost caps in YAML; get a nonzero exit when the agent misbehaves. No SaaS, no API keys, no provider calls inside the library. One dependency (`yaml`).

## Quickstart

Write evals:

```yaml
# evals/orders.yaml
- name: order lookup calls the right tool
  input: "Where is order 123?"
  expect_tools: ["get_order"]
  forbid_tools: ["refund_order"]
  output_contains: ["shipped"]
  output_not_contains: ["sorry"]
  max_cost_usd: 0.05
  max_tool_calls: 5
```

Adapt your agent to the contract (one function, framework-agnostic):

```ts
// agent.js
export default async function agent(input) {
  // call LangGraph, the Vercel AI SDK, CrewAI, whatever you use
  return {
    output: "Order 123 has shipped.",
    toolCalls: [{ name: "get_order", args: { id: 123 } }],
    costUsd: 0.012, // optional, required only when max_cost_usd is set
  };
}
```

Run it:

```bash
agent-eval run --agent ./agent.js --evals ./evals/
```

```
PASS  order lookup calls the right tool  (812ms)

1/1 passed, total cost $0.0120, 812ms
```

Any failure exits nonzero, so it drops straight into CI:

```yaml
# .github/workflows/evals.yml
- run: agent-eval run --agent ./agent.js --evals ./evals/
```

## Install

```bash
npm install -g github:richardsondx/agent-eval-ci
```

(The npm registry package `@richardsondx/agent-eval` is coming; the GitHub install works today.)

## The agent contract

```ts
type AgentFn = (input: string) => Promise<{
  output: string;
  toolCalls: Array<{ name: string; args?: unknown }>;
  costUsd?: number;
}>;
```

Your adapter translates whatever your framework returns into this shape. If the agent throws, the case fails with an `agent_error` assertion.

## Assertions

| YAML key | Meaning |
|---|---|
| `expect_tools` | These tools must be called, in this order (other calls may happen between) |
| `forbid_tools` | These tools must never be called |
| `output_contains` | Output must include each entry: plain substring or `/regex/flags` |
| `output_not_contains` | Output must not include each entry |
| `max_cost_usd` | Fail when `costUsd` exceeds this; fail when the agent does not report a cost at all |
| `max_tool_calls` | Fail when the agent makes more tool calls than this |
| `judge.rubric` | Free-form quality check, decided by your `judgeFn` (see below) |

## Baseline diffing

Point at a baseline file to catch regressions between runs:

```bash
# first run: writes baseline.jsonl, exits 0
agent-eval run --agent ./agent.js --evals ./evals/ --baseline ./baseline.jsonl

# later runs: diffs against it
agent-eval run --agent ./agent.js --evals ./evals/ --baseline ./baseline.jsonl
```

```
new failures vs baseline: order lookup calls the right tool
fixed vs baseline: refund flow is allowed when asked
cost order lookup calls the right tool: $0.01 -> $0.09 (+0.08)
```

`--update-baseline` overwrites the baseline with the current run. `--json` prints one JSON result per line (JSONL) instead of the human-readable report.

## Optional judge

For checks no matcher can express, add a rubric and supply a judge function. The library never calls a model itself; your `judgeFn` can call whatever you want.

```yaml
- name: support tone stays professional
  input: "My order is late and I am angry."
  judge:
    rubric: "The response apologizes and offers a concrete next step, without blaming the customer."
```

```bash
agent-eval run --agent ./agent.js --evals ./evals/ --judge ./judge.js
```

```js
// judge.js
export default async function judge(output, evalCase) {
  const verdict = await myLlmJudge(evalCase.judge.rubric, output);
  return { pass: verdict.pass, reason: verdict.reason };
}
```

## Library use

```ts
import { loadCases, runEvals } from "@richardsondx/agent-eval";

const cases = loadCases("./evals/");
const { results, summary } = await runEvals(cases, myAgent, { judgeFn });
if (summary.failed > 0) process.exitCode = 1;
```

## Adapter examples

Vercel AI SDK (`generateText` with tools):

```ts
import { generateText } from "ai";

export default async function agent(input: string) {
  const result = await generateText({
    model: myModel,
    tools: { get_order: getOrderTool, refund_order: refundOrderTool },
    prompt: input,
  });
  return {
    output: result.text,
    toolCalls: result.steps.flatMap((s) =>
      (s.toolCalls ?? []).map((t) => ({ name: t.toolName, args: t.args }))
    ),
    costUsd: result.usage ? usdFor(result.usage) : undefined,
  };
}
```

LangChain:

```ts
export default async function agent(input: string) {
  const result = await executor.invoke({ input });
  return {
    output: result.output,
    toolCalls: (result.intermediateSteps ?? []).map((s) => ({
      name: s.action.tool,
      args: s.action.toolInput,
    })),
  };
}
```

## Why not a hosted eval platform

Hosted platforms are built for teams running thousands of evals with human review. This is for the other 95 percent: a YAML file in your repo and one CI step that fails the build when the agent starts refunding orders unprompted.

## License

MIT
