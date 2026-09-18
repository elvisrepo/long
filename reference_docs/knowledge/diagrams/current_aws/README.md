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
| V005 | 2026-09-04 | V004 plus the empty private `syncvitals/staging/backend` ECR repository in Frankfurt with immutable tags, AES-256 encryption, free basic scan on push, and no lifecycle or repository permission policy; no backend image or API compute exists yet |
| V006 | 2026-09-04 | V005 plus the tested Trixie-based ARM64 backend image from Git commit `912f84c17dd2b8535acec65dd60751d17d245dd5`, pinned by ECR index digest `sha256:f830d2790257ce835ace60268d1408d71f3b50c4b3eb205c5f8360dd3d9d9122`; its OS-package scan findings are explicitly accepted only for demo-data presentation staging, while the earlier Bookworm artifact remains rejected |
| V007 | 2026-09-04 | V006 plus the Frankfurt Secrets Manager secret `longevity/staging/backend-runtime`; its single `AWSCURRENT` version passed the 15-key loader contract and password-consistency check entirely in memory, no secret value is recorded in the model, and instance-role retrieval remains unverified until EC2 exists |
| V008 | 2026-09-04 | V007 plus the global EC2 role and instance profile `syncvitals-staging-ec2-role`; EC2-only trust, Systems Manager core, one-repository ECR pull, one-secret read, and exact ACME TXT mutation were verified, while unrelated ECR, secret, and DNS record access is implicitly denied and destination-specific logging/backup permissions remain deferred |
| V009 | 2026-09-06 | V008 plus origin security group `sg-0bb8f60ee0b21cb06` in the Frankfurt default VPC; its only inbound rule is TCP 443 from AWS-managed CloudFront origin-facing prefix list `pl-a3a144ca`, with no CIDR ingress or administrative/application/database ports exposed; the group remains unattached because EC2 does not exist yet |
| V010 | 2026-09-06 | V009 plus running instance `i-08fbc9f0c53265b63`: a healthy `t4g.small` ARM64 host in `eu-central-1c` using Canonical Ubuntu 24.04, the intended instance profile and origin security group, required IMDSv2, termination protection, an AWS-managed-key-encrypted 16 GiB gp3 root volume, and verified Session Manager access; host bootstrap remains incomplete because Docker, Nginx, Certbot, its Route 53 plugin, and the CloudWatch agent are not installed |
| V011 | 2026-09-07 | V010 plus a fully updated Ubuntu host running AWS kernel `7.0.0-1012-aws`, verified native ARM64 Docker Engine 29.8.0 with containerd 2.3.4, Compose 5.5.1, and Buildx 0.37.0, plus verified Nginx 1.24.0; Nginx currently serves only its packaged local port-80 site, while the security group blocks port 80 and origin TLS, reverse proxying, application containers, the CloudFront API origin, and persistent PostgreSQL storage remain absent |
| V012 | 2026-09-07 | V011 plus verified Certbot 2.9.0, its discovered Route 53 DNS-01 authenticator, and an enabled, active, scheduled automatic renewal timer; no certificate has been requested, no ACME TXT record has been changed, and origin TLS, reverse proxying, application containers, the CloudFront API origin, and persistent PostgreSQL storage remain absent |
| V013 | 2026-09-08 | V012 plus CloudWatch Agent installed and configured through the console, inline IAM policy `SyncVitalsStagingMetricsWrite` scoped to `CWAgent` in Frankfurt, and verified `mem_used_percent` and root-only `disk_used_percent` datapoints collected every 60 seconds; workload detection is disabled, logs/traces/alarms remain unconfigured, and the agent's exact installed version and boot enablement remain uninspected |
| V014 | 2026-09-09 | V013 plus encrypted 10 GiB gp3 PostgreSQL volume `vol-0f23b93a2f1cd46b4` in `eu-central-1c`, retained on instance termination, formatted ext4 and mounted by UUID at `/srv/syncvitals`; automatic remount and directory ownership `999:999` with mode `700` verified after reboot. Pinned PostgreSQL 16 image is cached, but the database has not been initialized or started; database-disk monitoring and deployment mount guard remain pending |
| V015 | 2026-09-09 | V014 plus Elastic IP `3.73.229.16` associated with the EC2 origin, Route 53 A record `origin-staging.syncvitals.space`, issued Let’s Encrypt certificate with successful DNS-01 renewal dry-run, Nginx deploy hook, and verified HTTP-to-HTTPS redirect/TLS listener; HTTPS `/` intentionally returns 404 until the API is deployed |
| V016 | 2026-09-12 | V015 plus the new digest-pinned ARM64 Django image, installed deployment bundle and reboot-verified Docker/EBS storage guard, AWS CLI v2 prerequisite, healthy PostgreSQL 16 and Django/Gunicorn containers, applied migrations, persistent database bind mount, loopback-only Gunicorn port, root-only Nginx origin-header guard, and CloudFront HTTPS custom origin with uncached `/api/*` routing; public liveness/readiness, API 404 isolation, SPA deep links, and cache misses are verified. Logs, alarms, backups, restore testing, and authenticated browser/Android/Stripe flows remain pending |
| V017 | 2026-09-15 | V016 plus verified Stripe test Checkout, Portal, signed webhook reconciliation, and period-end cancellation state; a separate private SSE-S3, versioned, HTTPS-only PostgreSQL backup bucket; permanent instance-role write-only access below `postgresql/`; and one checksum-verified custom-format dump restored successfully into an isolated disposable PostgreSQL 16 container with selected source/restored row counts matching. Daily scheduling, retention, backup monitoring, logs, alarms, and Android end-to-end flows remain pending |
| V018 | 2026-09-17 | V017 plus an enabled daily PostgreSQL backup timer, two verified S3 lifecycle rules (90-day current versions, 30-day noncurrent versions, seven-day incomplete uploads, and delete-marker cleanup), prefix-scoped restore-read IAM access, an enabled monthly isolated restore check, and an enabled six-hour freshness heartbeat. CloudWatch backup/restore metrics and failure/overdue alarms are `OK`; the backup composite alarm and SNS email delivery were verified. A focused backup-operations view accompanies the complete deployment view. Application logs, traces, and Android-to-public-staging sync remain unverified. |

## Validation after V018

On 2026-09-17 the operator reported that the Android staging app connects to
the hosted backend, automatic Weight and Steps sync works, and the synced data
appears correctly in the hosted frontend. This functional validation happened
after the V018 snapshot; its historical state remains unchanged. No new AWS
resource was added, so there is no new deployment diagram version. The deployed
image digest and exact test conditions still need to be recorded in the staging
playbook. Application log shipping and privacy review remain open.

## Companion Request Flows

- [`v004-public-frontend-request-flows.md`](./v004-public-frontend-request-flows.md)
  explains the DNS records, CloudFront origin and alias terms, frontend SPA
  rewrite, current failing API path, and future Nginx API path. Mermaid is used
  for behavioral ordering; the matching Structurizr DSL remains the structural
  C4 source of truth.

## Host Operations Log

- [`ec2-host-change-log.md`](./ec2-host-change-log.md) is the append-only
  record of every package, repository, service, configuration, and persistent
  filesystem change made inside the presentation-staging EC2 host.

## Validation

From this directory, validate an individual snapshot with the Structurizr CLI
image currently used by the project:

```bash
docker run --rm \
  -v "$PWD:/usr/local/structurizr:ro" \
  structurizr/structurizr \
validate -workspace /usr/local/structurizr/v018-automated-backup-restore-monitoring.dsl
```

The next version should be created only after the next manually provisioned AWS
resource has been verified.
