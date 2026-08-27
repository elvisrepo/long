import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUploadPlan,
  executeUploadPlan,
  parseArguments,
} from "../../deployment/static-upload.mjs";

const temporaryDirectories: string[] = [];
const contractPath = resolve(
  process.cwd(),
  "deployment/cloudfront-delivery-contract.json",
);

async function createBuildDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "longevity-static-upload-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "assets", "app-abc123.js"), "app");
  await writeFile(join(directory, "favicon.svg"), "icon");
  await writeFile(join(directory, "index.html"), "index");
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("static frontend upload", () => {
  it("rejects a missing destination bucket", () => {
    expect(() => parseArguments(["--dry-run"])).toThrow(
      "Usage: npm run deploy:static -- --bucket <bucket-name> [--dry-run]",
    );
  });

  it("plans immutable assets first and the application shell last", async () => {
    const distDirectory = await createBuildDirectory();

    const plan = await createUploadPlan({ distDirectory, contractPath });

    expect(plan).toEqual({
      deleteRemovedObjects: false,
      uploads: [
        {
          sourcePath: join(distDirectory, "assets", "app-abc123.js"),
          destinationKey: "assets/app-abc123.js",
          cacheControl: "public,max-age=31536000,immutable",
        },
        {
          sourcePath: join(distDirectory, "favicon.svg"),
          destinationKey: "favicon.svg",
          cacheControl: "no-cache,no-store,must-revalidate",
        },
        {
          sourcePath: join(distDirectory, "index.html"),
          destinationKey: "index.html",
          cacheControl: "no-cache,no-store,must-revalidate",
        },
      ],
    });
  });

  it("rejects a build without an application shell", async () => {
    const distDirectory = await createBuildDirectory();
    await rm(join(distDirectory, "index.html"));

    await expect(
      createUploadPlan({ distDirectory, contractPath }),
    ).rejects.toThrow("Build output is missing index.html");
  });

  it("returns AWS copy commands without executing them in dry-run mode", async () => {
    const distDirectory = await createBuildDirectory();
    const plan = await createUploadPlan({ distDirectory, contractPath });
    const runCommand = vi.fn();

    const commands = await executeUploadPlan({
      plan,
      bucket: "longevity-staging-frontend",
      dryRun: true,
      runCommand,
    });

    expect(runCommand).not.toHaveBeenCalled();
    expect(commands).toHaveLength(3);
    expect(commands[0]).toEqual([
      "s3",
      "cp",
      join(distDirectory, "assets", "app-abc123.js"),
      "s3://longevity-staging-frontend/assets/app-abc123.js",
      "--cache-control",
      "public,max-age=31536000,immutable",
      "--only-show-errors",
    ]);
    expect(commands.at(-1)?.[3]).toBe(
      "s3://longevity-staging-frontend/index.html",
    );
    expect(commands.flat()).not.toContain("--delete");
  });

  it("does not upload index.html after an earlier upload fails", async () => {
    const distDirectory = await createBuildDirectory();
    const plan = await createUploadPlan({ distDirectory, contractPath });
    const runCommand = vi.fn(async (command: string[]) => {
      if (command[3]?.endsWith("/favicon.svg")) {
        throw new Error("simulated upload failure");
      }
    });

    await expect(
      executeUploadPlan({
        plan,
        bucket: "longevity-staging-frontend",
        dryRun: false,
        runCommand,
      }),
    ).rejects.toThrow("simulated upload failure");

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(runCommand.mock.calls.flat(2)).not.toContain(
      "s3://longevity-staging-frontend/index.html",
    );
  });
});
