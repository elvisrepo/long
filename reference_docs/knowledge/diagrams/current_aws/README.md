# Current AWS C4 Deployment History

## Purpose

This directory records the infrastructure that actually exists while the
presentation-staging environment is provisioned manually. It grows from an
empty AWS account toward the target **Deployment View: [Current] Presentation
Staging — CloudFront + Nginx + One EC2**.

The target architecture remains in
`reference_docs/knowledge/diagrams/longevity-architecture.dsl`. These snapshots
do not replace or modify that target; they show verified implementation progress.

## Versioning Rules

1. Each `vNNN-*.dsl` file is a standalone Structurizr workspace.
2. A version contains only resources that exist and have been verified at that
   checkpoint. Planned resources are intentionally absent.
3. Once a version is superseded, keep it immutable except for a syntax or factual
   correction that does not rewrite the historical state.
4. Create the next version by copying the latest snapshot and adding the newly
   verified resource boundary.
5. Record external dependencies when they explain an AWS boundary, such as the
   Hostinger registrar delegating DNS to Route 53.
6. Never place credentials, validation values, secret headers, or private
   configuration in a diagram.

## Versions

| Version | Date | Verified deployment state |
|---|---|---|
| V001 | 2026-08-31 | Hostinger registration delegates `syncvitals.space` to a Route 53 public hosted zone; ACM issued the unattached `staging.syncvitals.space` viewer certificate in `us-east-1`; the Frankfurt default VPC exists but contains no Longevity resources |
| V002 | 2026-08-31 | V001 plus the private account-regional frontend S3 bucket in `eu-central-1`; public access and ACLs are blocked, SSE-S3 is enabled, and S3 website hosting is absent; CloudFront/OAC and frontend objects do not exist in this checkpoint |
| V003 | 2026-09-01 | V002 plus deployed CloudFront distribution `E1BWDS134TAX2K`, its SigV4 always-sign OAC, the attached ACM viewer certificate, and a distribution-scoped S3 `GetObject` policy; Route 53 still has no staging A/AAAA alias and CloudFront has no default root object |
| V004 | 2026-09-01 | V003 plus public A/AAAA aliases for `staging.syncvitals.space`, `index.html` as the default root, the LIVE SPA rewrite function, no-cache application-shell delivery, optimized `/assets/*` delivery, S3 versioning and HTTPS-only enforcement, and the first uploaded 18-file Vite build; no EC2/Nginx/Django/PostgreSQL API origin exists yet |

## Validation

From this directory, validate an individual snapshot with the Structurizr CLI
image currently used by the project:

```bash
docker run --rm \
  -v "$PWD:/usr/local/structurizr:ro" \
  structurizr/structurizr \
  validate -workspace /usr/local/structurizr/v004-public-frontend-live.dsl
```

The next version should be created only after the next manually provisioned AWS
resource has been verified.
