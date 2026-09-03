# Presentation Staging Manual Provisioning

## Use When

- Load this when manually creating, checking, or resuming the low-cost AWS
  presentation-staging environment.
- This is an operator runbook, not Infrastructure as Code. Record every created
  resource so the topology can later be reproduced with Terraform.

## Fixed Architecture Decisions

- Public application hostname: `staging.syncvitals.space`.
- CloudFront is the only public application entry point.
- Frontend: private S3 bucket reached through CloudFront Origin Access Control.
- API origin: Nginx on one public ARM64 EC2 host, reached only from CloudFront.
- Application: one Gunicorn/Django container plus a one-off migration container.
- Database: **plain PostgreSQL 16** on the EC2 host, persisted on encrypted EBS.
- Operations: Systems Manager, not public SSH.
- Secrets: one validated Secrets Manager JSON snapshot; no production `.env`.
- Backups: monitored `pg_dump` uploads to a separate private, encrypted,
  versioned S3 bucket, followed by a restore drill.
- Not in presentation staging: ALB, NAT Gateway, RDS, TimescaleDB, Redis, or
  Celery. Reconsider TimescaleDB only after a measured query need and a tested
  migration plan.

This is a low-cost presentation environment, not a highly available production
system. Losing the one EC2 host temporarily removes Nginx and Django; losing or
corrupting its database volume risks data until a tested backup is restored.

## Current Checkpoint — 2026-09-03

Already created and verified:

- Route 53 public hosted zone for `syncvitals.space`;
- ACM viewer certificate in `us-east-1` for `staging.syncvitals.space`;
- private, encrypted, versioned frontend bucket
  `syncvitals-staging-frontend-173291122778-eu-central-1-an`;
- CloudFront distribution `E1BWDS134TAX2K` with private S3 access, the SPA
  rewrite function, immutable asset caching, and uncached application-shell
  caching;
- Route 53 A and AAAA aliases from `staging.syncvitals.space` to CloudFront;
- deployed frontend assets and successful public SPA/deep-link checks.

CloudFront currently has only the private S3 origin. The `/api/*` origin and
behavior must not be added until the EC2 origin is ready and healthy.

## Cost Gate

AWS Price List rates queried on 2026-09-03 for Frankfurt, before credits, tax,
and usage-dependent charges:

| Fixed component | Assumption | Monthly estimate |
|---|---:|---:|
| EC2 | `t4g.small`, 730 hours at $0.0192/hour | $14.0160 |
| EBS gp3 | 26 GiB total at $0.0952/GiB-month | $2.4752 |
| Public IPv4 | one address, 730 hours at $0.005/hour | $3.6500 |
| Secrets Manager | one secret | $0.4000 |
| Route 53 | first hosted zone | $0.5000 |
| **Fixed subtotal** | | **$21.0412/month** |

CloudFront requests/transfer, S3 storage/requests, ECR image storage, Route 53
queries, CloudWatch, and backups are additional usage-based charges. At the
expected presentation traffic they should be small, but they are not guaranteed
to be zero. Check the Billing dashboard and existing budget alarm before launch.
Stop or remove unused resources; an allocated public IPv4 still incurs cost.

## Provisioning Order and Gates

Perform one numbered section at a time. Do not configure the next public hop
until the current section passes its gate.

### 1. Create the backend ECR repository

In `eu-central-1`, create one private repository named
`syncvitals/staging/backend`.

- Enable tag immutability.
- Enable scan on push.
- Use AES-256/SSE-S3 unless a compliance requirement specifically needs a
  customer-managed KMS key.
- Add a lifecycle rule only after confirming which rollback images must remain.

Gate: the empty private repository exists in account `173291122778`, and its URI
has been recorded without publishing credentials.

### 2. Publish one immutable ARM64 backend image

- Build from `backend/Dockerfile` for `linux/arm64` because the selected EC2
  family is Graviton (`t4g`).
- Tag with the full Git commit SHA, never only `latest`.
- Push to the private ECR repository.
- Record the image digest and review the scan result.
- Set `BACKEND_IMAGE` to the digest-qualified image URI for deployment.

Gate: ECR reports an ARM64 image and the intended digest; critical findings are
resolved or explicitly accepted before deployment.

### 3. Create the runtime secret

Create `longevity/staging/backend-runtime` in `eu-central-1` as JSON. Its keys
are defined by `backend/config/settings/production_environment.py` plus the
database-container bootstrap key enforced by `backend/scripts/staging_runtime.py`.

Important database invariant:

- `POSTGRES_PASSWORD` is the raw database password used only by PostgreSQL;
- `DATABASE_URL` contains the URL-encoded form of that same password and uses
  host `database`, port `5432`, database `longevity`, and user `longevity`;
- the loader rejects a mismatch before Docker is invoked.

Do not paste secret values into this playbook, shell history, tickets, commits,
or screenshots. Use `config.settings.prod` values for the public staging host,
HTTPS CSRF origin, Stripe test mode, and deliberate log levels.

Gate: a Systems Manager session on the future host can invoke the loader and
receive only a redacted success/failure result; no `.env` file exists.

### 4. Create the EC2 instance role

Attach only the permissions the host needs:

- Systems Manager managed-instance core;
- pull-only access to the one ECR repository and ECR authorization token;
- `secretsmanager:GetSecretValue` for the one staging secret;
- narrowly scoped Route 53 record changes needed by Certbot DNS-01;
- CloudWatch log/metric publication;
- write-only backup access where practical to the future backup prefix.

Do not attach administrator access and do not place human AWS credentials on the
host.

Gate: IAM Access Analyzer finds no invalid resource policy, and the role scope
has been reviewed before it is attached.

### 5. Create the origin security group

- Inbound TCP 443: only the AWS-managed CloudFront origin-facing prefix list.
- No inbound 22, 80, 8000, or 5432.
- Retain outbound HTTPS/DNS access required for image pulls, certificate
  renewal, Secrets Manager, Systems Manager, and backups.

Gate: the console shows exactly one public-service inbound purpose—CloudFront to
Nginx on 443—and no world-open administration or application ports.

### 6. Create persistent encrypted storage

- EC2 root volume: 16 GiB gp3, encrypted.
- Database data volume: 10 GiB gp3, encrypted and tagged separately.
- For the database volume, disable delete-on-termination.
- After attachment, format it once, mount by filesystem UUID beneath
  `/srv/syncvitals`, add the UUID to `/etc/fstab`, and create
  `/srv/syncvitals/postgresql` with ownership suitable for the PostgreSQL
  container.

The staging Compose file bind-mounts `/srv/syncvitals/postgresql`; database data
must never rely on a container layer or temporary volume.

Gate: reboot the instance and prove the same encrypted volume remounts before
starting PostgreSQL.

### 7. Launch the EC2 host

- Region: `eu-central-1`.
- Image: official Ubuntu Server 24.04 LTS ARM64.
- Type: `t4g.small`.
- Require IMDSv2.
- Attach the reviewed instance role and origin security group.
- Do not configure an SSH key as the operational access path; verify Systems
  Manager registration.
- Install Docker Engine/Compose, Nginx, Certbot with the Route 53 DNS plugin,
  and the CloudWatch agent from trusted package sources.

Gate: a Systems Manager session works, IMDSv1 is disabled, Docker runs, and the
data-volume reboot test passes.

### 8. Assign the stable origin address and DNS name

- Allocate one Elastic IP and associate it with the instance.
- Create `origin-staging.syncvitals.space` as a Route 53 A record to that IP.
- This hostname is an origin endpoint, not the public application URL.

Gate: public DNS resolves the origin hostname to the Elastic IP. Port 443 is
still restricted to CloudFront at the security group.

### 9. Configure origin TLS and Nginx

- Obtain a Let's Encrypt certificate for `origin-staging.syncvitals.space`
  using DNS-01 through the instance role.
- Configure automatic renewal and a renewal-failure/expiry alarm.
- Require a secret custom CloudFront origin header before proxying `/api/*`.
- Proxy only to `http://127.0.0.1:18000`, preserve the public host deliberately,
  and set trusted forwarded protocol/address headers.
- Never terminate external traffic directly at Gunicorn.

Gate: Nginx configuration validation passes, renewal dry-run passes, direct
requests without the origin header are rejected, and the certificate chain is
valid.

### 10. Deploy PostgreSQL, migrate, and start the API

Use `backend/docker-compose.staging.yml` with a digest-qualified
`BACKEND_IMAGE`. Invoke deployment only through the validated runtime loader.

The flow is fixed:

1. fetch and validate one secret snapshot;
2. make PostgreSQL healthy on persistent EBS;
3. run `python manage.py migrate --no-input` in the one-off migration container;
4. stop if migration fails, leaving the prior API running;
5. start/replace the long-running API container;
6. wait for database-backed readiness through the loopback-published port.

A successful API replacement may cause a short maintenance interruption. This
environment does not implement blue/green or zero-downtime replacement.

Gate: both health routes pass locally on the host, migration exited zero, only
database and API remain long-running, and PostgreSQL has no host/public port.

### 11. Add the CloudFront API origin and behavior

- Add `origin-staging.syncvitals.space` as the HTTPS custom origin.
- Add the secret origin header also validated by Nginx.
- Add `/api/*` behavior before the default S3 behavior.
- Allow all API methods required by Django.
- Disable caching and forward request bodies, query strings, authorization,
  cookies, and CSRF headers required by the existing contracts.
- Keep the SPA rewrite away from `/api/*` and asset requests.

Gate: API failures remain API responses, deep links still return the React
application shell, missing hashed assets remain `404`, and direct EC2-origin
requests without CloudFront's secret header are rejected.

### 12. Prove the public system

- Browser sign-in, refresh, metric write/read, and deep-link reload.
- Physical Android staging login and Weight/Steps sync without `adb reverse`.
- Public liveness and database-backed readiness.
- Stripe test Checkout, Portal, and signed webhook reconciliation.
- Confirm logs contain no credentials, tokens, health data, or secret payloads.

Gate: every check is recorded with date, deployed image digest, and outcome.

### 13. Back up and restore before calling staging recoverable

- Create a separate private, encrypted, versioned backup bucket.
- Schedule `pg_dump` from the database container to a dated object prefix.
- Publish job success/failure and object-age signals to CloudWatch.
- Restore one backup into a disposable PostgreSQL instance and verify expected
  rows/application queries.

Gate: a successful upload alone is not enough; the documented restore drill
must pass.

## Resume Checklist

When resuming after a pause:

1. Check AWS caller identity and selected region.
2. Check Billing/Free Tier credits and the budget alarm.
3. Read the current checkpoint above and the latest versioned C4 file under
   `reference_docs/knowledge/diagrams/current_aws/`.
4. Inspect existing AWS resources read-only before creating anything.
5. Continue with exactly the first incomplete numbered section.

