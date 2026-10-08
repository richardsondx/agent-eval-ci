/**
 * CLI argument parsing and module loading, kept separate from cli.ts so the
 * parsing logic is unit-testable without executing the CLI entrypoint.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface CliArgs {
  command?: string;
  agent?: string;
  evals?: string;
  baseline?: string;
  judge?: string;
  updateBaseline: boolean;
  json: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { updateBaseline: false, json: false };
  const rest = argv.slice(2);
  if (rest.length > 0 && !rest[0]?.startsWith("-")) {
    const command = rest.shift();
    if (command) args.command = command;
  }
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i] as string;
    switch (flag) {
      case "--agent":
      case "--evals":
      case "--baseline":
      case "--judge": {
        const value = rest[++i];
        if (!value || value.startsWith("-")) {
          throw new Error(`agent-eval-ci: ${flag} requires a value.`);
        }
        if (flag === "--agent") args.agent = value;
        if (flag === "--evals") args.evals = value;
        if (flag === "--baseline") args.baseline = value;
        if (flag === "--judge") args.judge = value;
        break;
      }
      case "--update-baseline":
        args.updateBaseline = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--help":
      case "-h":
        args.command = "__help";
        return args;
      default:
        throw new Error(`agent-eval-ci: unknown flag ${flag}.`);
    }
  }
  return args;
}

export function printUsage(): void {
  console.log(`agent-eval-ci: tiny YAML eval harness for AI agents.

Usage:
  agent-eval-ci run --agent ./agent.js --evals ./evals/ [options]

Options:
  --agent <path>        JS module exporting the agent (default export) as AgentFn
  --evals <path>        YAML file or directory of YAML eval cases
  --baseline <path>     JSONL baseline; created on first run, diffed afterwards
  --update-baseline     overwrite the baseline with this run's results
  --judge <path>        JS module exporting a judgeFn for judge: cases
  --json                print results as JSONL instead of human-readable output`);
}

/** Import a JS module and take its default export (or module.exports) as a function. */
export async function loadFn<T>(path: string, kind: string): Promise<T> {
  const url = pathToFileURL(resolve(path)).href;
  const mod = (await import(url)) as Record<string, unknown>;
  const fn = (mod["default"] ?? mod) as unknown;
  if (typeof fn !== "function") {
    throw new Error(
      `agent-eval-ci: ${kind} module ${path} must export a function (default export).`
    );
  }
  return fn as T;
}
