import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const contractPath = resolve(
  process.cwd(),
  "deployment/cloudfront-delivery-contract.json",
);

function loadContract(): Record<string, unknown> {
  return JSON.parse(readFileSync(contractPath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("CloudFront static delivery contract", () => {
  it("caches content-hashed Vite assets as immutable objects", () => {
    const contract = loadContract();

    expect(contract).toMatchObject({
      schema_version: 1,
      static_behaviors: {
        immutable_assets: {
          path_pattern: "assets/*",
          allowed_methods: ["GET", "HEAD", "OPTIONS"],
          cached_methods: ["GET", "HEAD", "OPTIONS"],
          compress: true,
          cache_policy: {
            type: "aws_managed",
            name: "CachingOptimized",
            id: "658327ea-f89d-4fab-a63d-7e88639e58f6",
          },
          upload_cache_control: "public,max-age=31536000,immutable",
        },
      },
    });
  });

  it("never caches the HTML application shell", () => {
    const contract = loadContract();

    expect(contract).toMatchObject({
      static_behaviors: {
        application_shell: {
          path_pattern: "default",
          allowed_methods: ["GET", "HEAD", "OPTIONS"],
          cached_methods: ["GET", "HEAD", "OPTIONS"],
          compress: true,
          cache_policy: {
            type: "custom",
            minimum_ttl_seconds: 0,
            default_ttl_seconds: 0,
            maximum_ttl_seconds: 0,
            headers: "none",
            cookies: "none",
            query_strings: "none",
          },
          upload_cache_control: "no-cache,no-store,must-revalidate",
        },
      },
    });
  });
});
