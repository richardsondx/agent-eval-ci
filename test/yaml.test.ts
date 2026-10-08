import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCases } from "../src/yaml.js";

let dir = "";
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

function makeDir(files: Record<string, string>): string {
  dir = mkdtempSync(join(tmpdir(), "evals-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

const VALID = `- name: order lookup
  input: "Where is order 123?"
  expect_tools: ["get_order"]
  forbid_tools: ["refund_order"]
  output_contains: ["shipped"]
  output_not_contains: ["sorry"]
  max_cost_usd: 0.05
  max_tool_calls: 5
`;

describe("loadCases", () => {
  it("parses a single YAML file", () => {
    const d = makeDir({ "a.yaml": VALID });
    const cases = loadCases(join(d, "a.yaml"));
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      name: "order lookup",
      input: "Where is order 123?",
      expectTools: ["get_order"],
      forbidTools: ["refund_order"],
      outputContains: ["shipped"],
      outputNotContains: ["sorry"],
      maxCostUsd: 0.05,
      maxToolCalls: 5
    });
  });

  it("loads every YAML file in a directory, sorted", () => {
    const d = makeDir({
      "b.yaml": `- name: second\n  input: "b"\n`,
      "a.yml": `- name: first\n  input: "a"\n`,
      "ignore.txt": "not yaml"
    });
    const cases = loadCases(d);
    expect(cases.map((c) => c.name)).toEqual(["first", "second"]);
  });

  it("parses a judge block", () => {
    const d = makeDir({
      "j.yaml": `- name: judged\n  input: "x"\n  judge:\n    rubric: "Answer must be polite."\n`
    });
    const cases = loadCases(join(d, "j.yaml"));
    expect(cases[0]?.judge).toEqual({ rubric: "Answer must be polite." });
  });

  it.each([
    ["missing name", `- input: "x"\n`, "without a string \"name\""],
    ["missing input", `- name: n\n`, "missing a string \"input\""],
    ["not a list", `name: n\ninput: x\n`, "must contain a YAML list"],
    ["bad expect_tools", `- name: n\n  input: x\n  expect_tools: get_order\n`, "must be a list of strings"],
    ["bad max_cost_usd", `- name: n\n  input: x\n  max_cost_usd: cheap\n`, "must be a number"],
    ["bad judge", `- name: n\n  input: x\n  judge: be nice\n`, "must be a mapping"]
  ])("rejects %s", (_label, yaml, message) => {
    const d = makeDir({ "bad.yaml": yaml });
    expect(() => loadCases(join(d, "bad.yaml"))).toThrow(message);
  });

  it("rejects a missing path and an empty directory", () => {
    expect(() => loadCases("/nope/not-here")).toThrow("not found");
    const d = makeDir({ "x.txt": "hi" });
    expect(() => loadCases(d)).toThrow("no YAML files");
  });
});
