#!/usr/bin/env node
/**
 * agent-eval-ci CLI.
 *
 *   agent-eval-ci run --agent ./agent.js --evals ./evals/ [--baseline ./baseline.jsonl] [--update-baseline] [--judge ./judge.js] [--json]
 *
 * Exits 1 when any case fails, 0 when all pass, 2 on usage errors.
 */
import { existsSync } from "node:fs";
import { loadFn, parseArgs, printUsage } from "./args.js";
import { diffBaseline, readJsonl, writeJsonl } from "./jsonl.js";
import { exitCodeForSummary, runEvals } from "./runner.js";
import type { AgentFn, JudgeFn } from "./types.js";
import { loadCases } from "./yaml.js";

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error((err as Error).message);
    printUsage();
    return 2;
  }
  if (args.command === "__help" || !args.command) {
    printUsage();
    return args.command === "__help" ? 0 : 2;
  }
  if (args.command !== "run") {
    console.error(`agent-eval-ci: unknown command '${args.command}', expected 'run'.`);
    printUsage();
    return 2;
  }
  if (!args.agent || !args.evals) {
    console.error("agent-eval-ci: --agent and --evals are required.");
    printUsage();
    return 2;
  }

  const agent = await loadFn<AgentFn>(args.agent, "agent");
  const judgeFn = args.judge ? await loadFn<JudgeFn>(args.judge, "judge") : undefined;
  const cases = loadCases(args.evals);

  const runOptions: Parameters<typeof runEvals>[2] = {
    onCase: (r) => {
      if (!args.json) {
        console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  (${r.durationMs}ms)`);
        for (const f of r.failures) {
          console.log(`      [${f.assertion}] expected ${f.expected}; got ${f.actual}`);
        }
      }
    }
  };
  if (judgeFn) runOptions.judgeFn = judgeFn;
  const { results, summary } = await runEvals(cases, agent, runOptions);

  if (args.json) {
    for (const r of results) console.log(JSON.stringify(r));
  } else {
    console.log(
      `\n${summary.passed}/${summary.total} passed` +
        (summary.totalCostUsd > 0
          ? `, total cost $${summary.totalCostUsd.toFixed(4)}`
          : "") +
        `, ${summary.totalDurationMs}ms`
    );
  }

  if (args.baseline) {
    if (!existsSync(args.baseline)) {
      writeJsonl(args.baseline, results);
      if (!args.json) console.log(`baseline written to ${args.baseline}`);
    } else {
      const baseline = readJsonl(args.baseline);
      const diff = diffBaseline(baseline, results);
      if (!args.json) {
        if (diff.newFailures.length > 0) {
          console.log(`new failures vs baseline: ${diff.newFailures.join(", ")}`);
        }
        if (diff.fixed.length > 0) {
          console.log(`fixed vs baseline: ${diff.fixed.join(", ")}`);
        }
        const deltas = diff.costDeltas.filter((d) => d.delta !== 0);
        for (const d of deltas) {
          const sign = (d.delta as number) > 0 ? "+" : "";
          console.log(`cost ${d.name}: $${d.before} -> $${d.after} (${sign}${d.delta})`);
        }
      }
      if (args.updateBaseline) {
        writeJsonl(args.baseline, results);
        if (!args.json) console.log(`baseline updated at ${args.baseline}`);
      }
    }
  }

  return exitCodeForSummary(summary);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`agent-eval-ci: ${(err as Error).message}`);
    process.exitCode = 2;
  });
