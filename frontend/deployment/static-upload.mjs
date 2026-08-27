import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const usage =
  "Usage: npm run deploy:static -- --bucket <bucket-name> [--dry-run]";

export function parseArguments(arguments_, workingDirectory = process.cwd()) {
  let bucket;
  let dryRun = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--bucket") {
      bucket = arguments_[index + 1];
      index += 1;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else {
      throw new Error(usage);
    }
  }

  if (!bucket) {
    throw new Error(usage);
  }

  return {
    bucket,
    dryRun,
    distDirectory: resolve(workingDirectory, "dist"),
    contractPath: resolve(
      workingDirectory,
      "deployment/cloudfront-delivery-contract.json",
    ),
  };
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat();
}

function destinationKey(distDirectory, sourcePath) {
  return relative(distDirectory, sourcePath).split(sep).join("/");
}

export async function createUploadPlan({ distDirectory, contractPath }) {
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  const immutableCacheControl =
    contract.static_behaviors.immutable_assets.upload_cache_control;
  const shellCacheControl =
    contract.static_behaviors.application_shell.upload_cache_control;
  if (contract.upload.delete_removed_objects !== false) {
    throw new Error("Static deployment must retain superseded objects");
  }
  if (contract.upload.application_shell_position !== "last") {
    throw new Error("Static deployment must upload index.html last");
  }
  const files = await listFiles(distDirectory);
  const uploads = files.map((sourcePath) => {
    const key = destinationKey(distDirectory, sourcePath);
    return {
      sourcePath,
      destinationKey: key,
      cacheControl: key.startsWith("assets/")
        ? immutableCacheControl
        : shellCacheControl,
    };
  });

  if (!uploads.some((upload) => upload.destinationKey === "index.html")) {
    throw new Error("Build output is missing index.html");
  }

  uploads.sort((left, right) => {
    const priority = (key) => {
      if (key.startsWith("assets/")) return 0;
      if (key === "index.html") return 2;
      return 1;
    };
    return (
      priority(left.destinationKey) - priority(right.destinationKey) ||
      left.destinationKey.localeCompare(right.destinationKey)
    );
  });

  return {
    deleteRemovedObjects: contract.upload.delete_removed_objects,
    uploads,
  };
}

export async function executeUploadPlan({ plan, bucket, dryRun, runCommand }) {
  const commands = plan.uploads.map((upload) => [
    "s3",
    "cp",
    upload.sourcePath,
    `s3://${bucket}/${upload.destinationKey}`,
    "--cache-control",
    upload.cacheControl,
    "--only-show-errors",
  ]);

  if (!dryRun) {
    for (const command of commands) {
      await runCommand(command);
    }
  }

  return commands;
}

function runAwsCommand(arguments_) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("aws", arguments_, { shell: false, stdio: "inherit" });
    child.once("error", (error) => {
      rejectPromise(new Error(`Unable to start AWS CLI: ${error.message}`));
    });
    child.once("exit", (status) => {
      if (status === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`AWS CLI upload failed with status ${status}`));
      }
    });
  });
}

export async function deployStatic({
  arguments_,
  workingDirectory = process.cwd(),
  runCommand = runAwsCommand,
  writeLine = console.log,
}) {
  const options = parseArguments(arguments_, workingDirectory);
  const plan = await createUploadPlan(options);
  const commands = await executeUploadPlan({
    plan,
    bucket: options.bucket,
    dryRun: options.dryRun,
    runCommand,
  });

  if (options.dryRun) {
    for (const command of commands) {
      writeLine(
        `aws ${command.map((argument) => JSON.stringify(argument)).join(" ")}`,
      );
    }
  }
}

async function main() {
  try {
    await deployStatic({ arguments_: process.argv.slice(2) });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Static upload failed",
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
