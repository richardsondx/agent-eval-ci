/**
 * YAML case loading and validation.
 *
 * Accepts a single .yaml/.yml file (a list of cases) or a directory
 * (every .yaml/.yml file inside, sorted by filename).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { parse } from "yaml";
import type { EvalCase } from "./types.js";

const YAML_EXT = new Set([".yaml", ".yml"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectStringArray(
  value: unknown,
  field: string,
  caseName: string
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(
      `agent-eval: case "${caseName}" field "${field}" must be a list of strings.`
    );
  }
  return value as string[];
}

function validateCase(raw: unknown, source: string): EvalCase {
  if (!isRecord(raw)) {
    throw new Error(`agent-eval: ${source} contains a case that is not a mapping.`);
  }
  const name = raw["name"];
  const input = raw["input"];
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`agent-eval: ${source} has a case without a string "name".`);
  }
  if (typeof input !== "string") {
    throw new Error(
      `agent-eval: case "${name}" in ${source} is missing a string "input".`
    );
  }
  const maxCostUsd = raw["max_cost_usd"];
  if (maxCostUsd !== undefined && typeof maxCostUsd !== "number") {
    throw new Error(
      `agent-eval: case "${name}" field "max_cost_usd" must be a number.`
    );
  }
  const maxToolCalls = raw["max_tool_calls"];
  if (maxToolCalls !== undefined && typeof maxToolCalls !== "number") {
    throw new Error(
      `agent-eval: case "${name}" field "max_tool_calls" must be a number.`
    );
  }
  const judge = raw["judge"];
  let judgeSpec: EvalCase["judge"];
  if (judge !== undefined) {
    if (!isRecord(judge) || typeof judge["rubric"] !== "string") {
      throw new Error(
        `agent-eval: case "${name}" field "judge" must be a mapping with a string "rubric".`
      );
    }
    judgeSpec = { rubric: judge["rubric"] as string };
  }
  const out: EvalCase = { name, input };
  const expectTools = expectStringArray(raw["expect_tools"], "expect_tools", name);
  const forbidTools = expectStringArray(raw["forbid_tools"], "forbid_tools", name);
  const outputContains = expectStringArray(raw["output_contains"], "output_contains", name);
  const outputNotContains = expectStringArray(raw["output_not_contains"], "output_not_contains", name);
  if (expectTools) out.expectTools = expectTools;
  if (forbidTools) out.forbidTools = forbidTools;
  if (outputContains) out.outputContains = outputContains;
  if (outputNotContains) out.outputNotContains = outputNotContains;
  if (maxCostUsd !== undefined) out.maxCostUsd = maxCostUsd as number;
  if (maxToolCalls !== undefined) out.maxToolCalls = maxToolCalls as number;
  if (judgeSpec) out.judge = judgeSpec;
  return out;
}

function loadFile(filePath: string): EvalCase[] {
  const text = readFileSync(filePath, "utf-8");
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (err) {
    throw new Error(
      `agent-eval: failed to parse ${filePath}: ${(err as Error).message}`
    );
  }
  if (!Array.isArray(doc)) {
    throw new Error(
      `agent-eval: ${filePath} must contain a YAML list of cases.`
    );
  }
  return doc.map((raw) => validateCase(raw, filePath));
}

/** Load and validate every case from a YAML file or directory of YAML files. */
export function loadCases(target: string): EvalCase[] {
  const resolved = resolve(target);
  const stat = statSync(resolved, { throwIfNoEntry: false });
  if (!stat) {
    throw new Error(`agent-eval: evals path not found: ${target}`);
  }
  if (stat.isDirectory()) {
    const files = readdirSync(resolved)
      .filter((f) => YAML_EXT.has(extname(f).toLowerCase()))
      .sort();
    if (files.length === 0) {
      throw new Error(`agent-eval: no YAML files found in ${target}`);
    }
    return files.flatMap((f) => loadFile(join(resolved, f)));
  }
  return loadFile(resolved);
}
