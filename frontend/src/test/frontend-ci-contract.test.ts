import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflowPath = resolve(
  process.cwd(),
  "../.github/workflows/frontend-ci.yml",
);
const prettierIgnorePath = resolve(process.cwd(), ".prettierignore");

describe("frontend CI workflow", () => {
  it("checks frontend changes with the supported Node version", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("name: Frontend CI");
    expect(workflow).toContain('- "frontend/**"');
    expect(workflow).toContain("runs-on: ubuntu-24.04");
    expect(workflow).toContain("working-directory: frontend");
    expect(workflow).toContain(
      "uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    );
    expect(workflow).toContain(
      "uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0",
    );
    expect(workflow).toContain("node-version: 24");
    expect(workflow).toContain("run: npm ci");
    expect(workflow).toContain("run: npm audit --audit-level=high");
    expect(workflow).toContain("run: npm test");
    expect(workflow).toContain("run: npm run lint");
    expect(workflow).toContain("run: npm run format:check");
    expect(workflow).toContain("run: npm run build");
  });

  it("runs for every pull request", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("  pull_request:\n  workflow_dispatch:\n");
  });

  it("keeps generated router code outside the formatting gate", () => {
    const prettierIgnore = readFileSync(prettierIgnorePath, "utf8");

    expect(prettierIgnore.split("\n")).toContain("src/routeTree.gen.ts");
  });
});
