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
  it("uses a private S3 REST origin with every public-access block", () => {
    const contract = loadContract();

    expect(contract).toMatchObject({
      static_origin: {
        service: "s3",
        endpoint_type: "regional_rest",
        website_hosting: false,
        bucket: {
          access: "private",
          block_public_access: {
            block_public_acls: true,
            ignore_public_acls: true,
            block_public_policy: true,
            restrict_public_buckets: true,
          },
        },
      },
    });
  });

  it("hardens stored frontend objects and preserves overwritten versions", () => {
    const contract = loadContract();

    expect(contract).toMatchObject({
      static_origin: {
        bucket: {
          object_ownership: "BucketOwnerEnforced",
          encryption: {
            type: "SSE-S3",
            algorithm: "AES256",
          },
          transport: "https_only",
          versioning: "enabled",
        },
      },
    });
  });

  it("allows CloudFront through Origin Access Control only", () => {
    const contract = loadContract();

    expect(contract).toMatchObject({
      static_origin: {
        cloudfront_access: {
          mechanism: "origin_access_control",
          legacy_origin_access_identity: false,
          origin_type: "s3",
          signing_behavior: "always",
          signing_protocol: "sigv4",
        },
      },
    });
  });

  it("scopes the bucket policy to one CloudFront distribution", () => {
    const contract = loadContract();

    expect(contract).toMatchObject({
      static_origin: {
        bucket: {
          bucket_policy: {
            public_principal_allowed: false,
            deny_insecure_transport: true,
            cloudfront_read: {
              principal_service: "cloudfront.amazonaws.com",
              actions: ["s3:GetObject"],
              resource_scope: "objects_only",
              source_distribution_arn_required: true,
              source_account_required: true,
            },
          },
        },
      },
    });
  });

  it("requires encrypted access and audit visibility", () => {
    const contract = loadContract();

    expect(contract).toMatchObject({
      static_origin: {
        observability: {
          server_access_logging: {
            enabled: true,
            destination_encryption: "SSE-S3",
          },
          cloudtrail_data_events: {
            enabled: true,
            destination_encryption: "SSE-KMS",
          },
          cloudwatch_request_metrics: {
            enabled: true,
          },
        },
      },
    });
  });

  it("retains superseded hashed assets during deployment", () => {
    const contract = loadContract();

    expect(contract).toMatchObject({
      upload: {
        delete_removed_objects: false,
        application_shell_position: "last",
        superseded_asset_retention: "indefinite_until_manifest_aware_cleanup",
      },
    });
  });

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

  it("scopes SPA fallback to the static application-shell behavior", () => {
    const contract = loadContract();

    expect(contract).toMatchObject({
      distribution_custom_error_fallback: false,
      static_behaviors: {
        application_shell: {
          spa_fallback: {
            mechanism: "cloudfront_function",
            source: "deployment/spa-rewrite.js",
            runtime: "cloudfront-js-2.0",
            event_type: "viewer-request",
            association: "application_shell_behavior_only",
            rewrite_target: "/index.html",
            rewrite_methods: ["GET", "HEAD"],
            rewrite_path_kind: "extensionless",
            excluded_prefixes: ["/api", "/assets"],
            preserve_query_string: true,
          },
        },
      },
    });
  });
});
