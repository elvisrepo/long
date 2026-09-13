# Presentation Staging Manual Provisioning

## Use When

- Load this when manually creating, checking, or resuming the low-cost AWS
  presentation-staging environment.
- This is an operator runbook, not Infrastructure as Code. Record every created
  resource so the topology can later be reproduced with Terraform.
- Record every EC2 guest operating-system mutation in
  `reference_docs/knowledge/diagrams/current_aws/ec2-host-change-log.md`,
  including failed or partial package, repository, service, configuration, and
  persistent filesystem changes.

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

## Current Checkpoint — 2026-09-13

Already created and verified:

- Route 53 public hosted zone for `syncvitals.space`;
- ACM viewer certificate in `us-east-1` for `staging.syncvitals.space`;
- private, encrypted, versioned frontend bucket
  `syncvitals-staging-frontend-173291122778-eu-central-1-an`;
- CloudFront distribution `E1BWDS134TAX2K` with private S3 access, the SPA
  rewrite function, immutable asset caching, and uncached application-shell
  caching;
- Route 53 A and AAAA aliases from `staging.syncvitals.space` to CloudFront;
- deployed frontend assets and successful public SPA/deep-link checks;
- private ECR repository `syncvitals/staging/backend` in `eu-central-1` with
  immutable tags, AES-256 encryption, and basic scan on push;
- accepted Trixie-based ARM64 backend image from Git commit
  `cf1397bd91a169c0ac20e1c3e6acd73cdb60f996`, pinned by index digest
  `sha256:24edf7e3d5911c72a2565ff5b30b05d4eaeaf0b0eee7c0dac212731179deeb83`;
- Secrets Manager secret `longevity/staging/backend-runtime` in `eu-central-1`
  with one `AWSCURRENT` version whose 15 required values passed the loader's
  in-memory validation; automatic rotation is not configured;
- EC2 role and instance profile `syncvitals-staging-ec2-role`, trusted only by
  EC2, with `AmazonSSMManagedInstanceCore`, pull-only access to the one backend
  ECR repository, read-only access to the one runtime secret, and Route 53
  mutation limited to the origin certificate's ACME TXT record;
- origin security group `sg-0bb8f60ee0b21cb06` in the Frankfurt default VPC,
  with inbound TCP 443 restricted to AWS-managed CloudFront origin-facing
  prefix list `pl-a3a144ca`, no CIDR-based inbound rules, and default IPv4
  outbound access retained for required host dependencies;
- running EC2 instance `i-08fbc9f0c53265b63` in `eu-central-1c`: `t4g.small`
  ARM64 on Canonical Ubuntu 24.04, using the intended instance profile and
  origin security group, required IMDSv2, termination protection, both EC2
  health checks passing, an AWS-managed-key-encrypted 16 GiB gp3 root volume, and
  verified Session Manager access as `ssm-user` with passwordless `sudo`.

The EC2 launch is verified. Docker Engine 29.8.0, Compose 5.5.1, Buildx 0.37.0,
and containerd 2.3.4 were installed from Docker's official ARM64 Ubuntu
repository. AWS CLI 2.36.44 is installed from AWS's version-pinned ARM64 bundle
after PGP signature verification. Certbot 2.9.0 and its Route 53 DNS plugin are
installed; the certificate, automatic renewal timer, deploy hook, and renewal
dry-run are verified. CloudWatch Agent publishes memory and root-disk metrics
to `CWAgent` in Frankfurt; logs and alarms remain pending.

The encrypted database volume remounts at `/srv/syncvitals` after reboot. The
root-owned deployment bundle and Docker systemd storage guard are installed,
loaded, and reboot-verified. PostgreSQL 16 and the digest-pinned Django image
are running as healthy containers. PostgreSQL writes through the bind mount
`/srv/syncvitals/postgresql`; it has no host port. Gunicorn is published only on
`127.0.0.1:18000`. All migrations completed successfully.

Nginx terminates origin TLS, rejects requests without the root-only secret
origin header, and proxies accepted requests to Gunicorn. CloudFront now has an
HTTPS custom origin plus an uncached `/api/*` behavior that forwards all needed
methods, headers, cookies, query strings, and request bodies. Public readiness,
API-404 isolation, SPA deep-link routing, and repeated cache misses are verified.

A browser-created staging user can register, sign in, and retrieve the Free
subscription. The staging and local runtimes were verified to use test mode in
the same Stripe account. The active Pro plan catalog now contains the verified
Stripe sandbox prices for USD 10/month and USD 100/year; the public plan endpoint
returns both options. Checkout, Portal, and webhook reconciliation remain to be
proved end to end.

Image-scan acceptance recorded on 2026-09-12:

- ECR basic scanning completed with 0 critical, 1 high, 0 medium, and 0 low
  findings for the accepted image;
- the remaining high finding is CVE-2026-85091 in Debian's `zlib1g`; no fixed
  Trixie package was available at review time, and the affected non-blocking
  `gzwrite`/`gzprintf` continuation path is not intentionally used by the
  Django/Gunicorn service;
- this residual risk is accepted only for presentation staging containing
  demo/test data and a non-root application process;
- this acceptance does not apply to production or environments containing real
  health or personal data, and the image must be rescanned when its base image
  is refreshed. The operator deleted the prior ECR images, so this checkpoint
  has no image rollback candidate.

CloudFront's S3 frontend and `/api/*` Django origin are both deployed. Section
12 remains active for browser, Android, and Stripe end-to-end proof. Section 13
backup/restore work has not started.

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

Current result: passed on 2026-09-04 through the staging-only risk acceptance
recorded in the current checkpoint. Use the digest-qualified image URI, not the
mutable repository name or a convenience tag.

### 3. Create the runtime secret

Create `longevity/staging/backend-runtime` in `eu-central-1` as JSON. Its keys
are defined by `backend/runtime_contract.py` plus the
database-container bootstrap key enforced by `backend/scripts/staging_runtime.py`.

Important database invariant:

- `POSTGRES_PASSWORD` is the raw database password used only by PostgreSQL;
- `DATABASE_URL` contains the URL-encoded form of that same password and uses
  host `database`, port `5432`, database `longevity`, and user `longevity`;
- the host loader rejects a password or destination mismatch before Docker is
  invoked, including another engine, user, host, port, database, or URL options.

Do not paste secret values into this playbook, shell history, tickets, commits,
or screenshots. Use `config.settings.prod` values for the public staging host,
HTTPS CSRF origin, Stripe test mode, and deliberate log levels.

Gate: a Systems Manager session on the future host can invoke the loader and
receive only a redacted success/failure result; no `.env` file exists.

Current result: secret creation and contract validation passed on 2026-09-04.
The instance-role retrieval and no-`.env` host checks remain deferred until the
EC2 host exists.

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

Current result: the base role, instance profile, SSM access, runtime-read
policy, and DNS-01 policy passed document inspection and IAM simulation on
2026-09-04. The exact ACME TXT UPSERT is allowed; unrelated ECR repositories,
secrets, and DNS A-record changes are implicitly denied. CloudWatch publication
and backup-write permissions remain deferred until their destination resources
exist, so they can be scoped instead of granted broadly.

### 5. Create the origin security group

- Inbound TCP 443: only the AWS-managed CloudFront origin-facing prefix list.
- No inbound 22, 80, 8000, or 5432.
- Retain outbound HTTPS/DNS access required for image pulls, certificate
  renewal, Secrets Manager, Systems Manager, and backups.

Gate: the console shows exactly one public-service inbound purpose—CloudFront to
Nginx on 443—and no world-open administration or application ports.

Current result: passed on 2026-09-06. Live EC2 inspection confirmed exactly one
inbound rule: TCP 443 from `pl-a3a144ca`; there are no inbound IPv4/IPv6 CIDRs,
SSH, HTTP, Gunicorn, or PostgreSQL rules. The security group is attached to
instance `i-08fbc9f0c53265b63` as its only security group.

### 6. Launch the EC2 host with encrypted root storage

- Region: `eu-central-1`.
- Image: official Ubuntu Server 24.04 LTS ARM64.
- Type: `t4g.small`.
- Root volume: 16 GiB gp3, encrypted.
- Require IMDSv2.
- Attach the reviewed instance role and origin security group.
- Do not configure an SSH key as the operational access path; verify Systems
  Manager registration.
- Install Docker Engine/Compose, Nginx, Certbot with the Route 53 DNS plugin,
  and the CloudWatch agent from trusted package sources.

Gate: the instance is running with the intended encrypted root volume, role,
and security group; a Systems Manager session works, IMDSv1 is disabled, and
Docker runs.

Current result: gate passed as of 2026-09-08. The running instance, official
Ubuntu ARM64 image, type, encrypted root volume, role, security group, required
IMDSv2, EC2 status checks, termination protection, and Systems Manager access
were verified. Docker Engine 29.8.0, Compose 5.5.1, Buildx 0.37.0, and
containerd 2.3.4 are now installed from Docker's official ARM64 Ubuntu
repository. Docker is active, enabled at boot, reports native `aarch64`, and
successfully ran the `hello-world` container. Nginx 1.24.0 is installed,
enabled, syntax-checked, listening locally on port 80, and returned HTTP 200.
Certbot 2.9.0 and the Route 53 DNS plugin are installed and discovered; the
renewal timer is enabled, active, and scheduled. Certificate issuance remains
deferred until the stable origin address and hostname exist. CloudWatch Agent
is installed and configured through the console, with memory and root-disk
usage collected every 60 seconds and datapoint delivery verified. Exact agent
version and boot enablement remain to be inspected; logs and alarms are not
configured. See EC2-012 in the host change log for the configuration and IAM policy.

### 7. Create and attach persistent encrypted database storage

- After the instance's Availability Zone is known, create a separate 10 GiB
  gp3 volume in that same Availability Zone.
- Enable encryption, tag it separately as the staging database volume, and
  disable delete-on-termination.
- Attach it to the staging instance, format it once, mount by filesystem UUID
  beneath `/srv/syncvitals`, add the UUID to `/etc/fstab`, and create
  `/srv/syncvitals/postgresql` with ownership suitable for the PostgreSQL
  container.

The staging Compose file bind-mounts `/srv/syncvitals/postgresql`; database data
must never rely on a container layer or temporary volume.

Gate: reboot the instance and prove the same encrypted volume remounts before
starting PostgreSQL.

Current result: passed on 2026-09-09. Encrypted 10 GiB gp3 volume
`vol-0f23b93a2f1cd46b4` is attached in `eu-central-1c` with
`DeleteOnTermination=false`. After reboot, ext4 UUID
`f4a12602-0ab0-45ae-a73d-dc6fc8fb00e2` remounted at `/srv/syncvitals`;
`/srv/syncvitals/postgresql` retained ownership `999:999` and mode `700`.
No database has been initialized. The repository now includes the mount guard
and Docker boot override described in Section 10, but they have not yet been
installed or reboot-tested on EC2. They are required because fstab uses `nofail`.
Add database-disk
monitoring separately; the current agent configuration collects only `/`.

### 8. Assign the stable origin address and DNS name

- Allocate one Elastic IP and associate it with the instance.
- Create `origin-staging.syncvitals.space` as a Route 53 A record to that IP.
- This hostname is an origin endpoint, not the public application URL.

Gate: public DNS resolves the origin hostname to the Elastic IP. Port 443 is
still restricted to CloudFront at the security group.

Current result: passed on 2026-09-09. Elastic IP `3.73.229.16`
(`eipalloc-093b36cd5cd7ac947`) is associated with the staging host through
`eipassoc-0c713bbbe834242eb`. The origin A record was created, and the operator's
DNS lookup returned the assigned IP. No security-group change was performed.

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

Current result: partially passed on 2026-09-09. Certbot issued the origin
certificate (reported expiry 2026-12-08), its DNS-01 renewal dry-run passed,
and `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` successfully validated
and reloaded Nginx during the dry-run. Nginx TLS termination and the HTTP
redirect were then validated locally with `curl --resolve`. Origin-header
enforcement, API reverse proxying, and expiry/renewal alerting remain pending.
See EC2-015 through EC2-017 in the host change log.

### 10. Deploy PostgreSQL, migrate, and start the API

Use `backend/docker-compose.staging.yml` with a digest-qualified
`BACKEND_IMAGE`. Invoke deployment only through the validated runtime loader.

Repository fixes implemented on 2026-09-10; **not yet installed on EC2**:

- The loader uses only Python's standard library, checks the backend repository
  and SHA-256 image reference, and verifies the expected writable EBS filesystem
  before retrieving a secret. The database URL must target PostgreSQL at
  `database:5432`, user/database `longevity`, without query/fragment overrides.
- Both migration and API explicitly use `DJANGO_SETTINGS_MODULE=config.settings.prod`.
  The loopback readiness probe sends a hostname from `ALLOWED_HOSTS`.
- PostgreSQL cannot automatically create a missing bind source. All staging
  containers use Docker's `local` log driver with three 10 MiB log files.
- `scripts/staging_storage.py` checks the ext4 UUID
  `f4a12602-0ab0-45ae-a73d-dc6fc8fb00e2`, mount `/srv/syncvitals`, write access,
  and the prepared, non-symlinked PostgreSQL directory. Restoring to a newly
  formatted replacement disk requires deliberately updating this UUID.

#### Prepare the host bundle locally

From `backend/`, use a new output filename for each bundle:

```bash
uv run --no-sync python -m scripts.build_staging_bundle \
  --output /tmp/syncvitals-staging-deployment.tar.gz
```

The builder prints the archive's SHA-256 and refuses to overwrite an existing
file. Its explicit allowlist contains exactly:

```text
runtime_contract.py
docker-compose.staging.yml
scripts/__init__.py
scripts/staging_runtime.py
scripts/production_deployment.py
scripts/staging_storage.py
deploy/docker.service.d/10-staging-storage.conf
```

No application tree, `.env`, AWS credentials, or Python dependencies are included.
Transfer the bundle using the agreed operator-controlled path, compare its
SHA-256, and extract into the root-owned `/opt/syncvitals/deployment` directory.
For the first installation, this must be a new empty directory; review existing
files before updating an installation. Preserve the archive's relative paths.

Host prerequisites: Ubuntu Python 3.12 (`python3`), AWS CLI, `findmnt` from
util-linux, Docker Engine/Compose, the instance role, ECR pull authentication,
and the verified EBS mount. Django, Celery, and `uv` are not needed on the host.
Run the Python commands from the bundle root so its modules can be imported.

#### Install the boot guard before any database container

The override makes **all Docker containers on this dedicated staging host**
depend on the database mount. `RequiresMountsFor` and `After` order Docker after
mount activation; `BindsTo` stops Docker if systemd marks the mount inactive.
`ExecStartPre` verifies the UUID before Docker can restore existing containers.
Keep Docker live restore disabled for this dependency model. This uses
[systemd's mount and lifecycle dependencies](https://raw.githubusercontent.com/systemd/systemd/v255/man/systemd.unit.xml).

In the root Session Manager shell, after installing the bundle:

```bash
cd /opt/syncvitals/deployment
python3 scripts/staging_storage.py
install -d -m 0755 /etc/systemd/system/docker.service.d
install -m 0644 deploy/docker.service.d/10-staging-storage.conf \
  /etc/systemd/system/docker.service.d/
systemctl daemon-reload
mount_unit_path="$(systemctl show -p FragmentPath --value srv-syncvitals.mount)"
test -n "$mount_unit_path"
systemd-analyze verify "$mount_unit_path" docker.service
systemctl restart docker
systemctl is-active docker
docker info --format '{{.LiveRestoreEnabled}}'
systemctl show docker -p RequiresMountsFor -p BindsTo -p ExecStartPre
```

Stop on any failed check. Live restore must report `false`. Restarting Docker
is an initial-setup step here; once containers exist it requires a maintenance
window. Verify the loaded dependencies, reboot, then recheck the storage guard
and Docker status before the first database deployment. Do not test a missing
disk by unmounting or detaching a live database volume.

If the guard fails, restore the expected disk/mount and fix the reported cause;
do not bypass the guard or initialize PostgreSQL on the root disk. Once the
storage check passes, clear any service start limit with
`systemctl reset-failed docker` and start Docker again.

#### Deploy with the verified bundle

Set `BACKEND_IMAGE` to the reviewed, digest-qualified ECR image and establish
ECR pull authentication using the instance role. A newly built application
image must include `runtime_contract.py`; the Dockerfile now copies it. Local
smoke-image verification does not publish or approve an ARM64 image in ECR.

```bash
cd /opt/syncvitals/deployment
python3 -m scripts.staging_runtime \
  --secret-id longevity/staging/backend-runtime \
  --region eu-central-1 \
  -- python3 -m scripts.production_deployment \
  --compose-file docker-compose.staging.yml \
  --project-name syncvitals-staging
```

`scripts.production_deployment` is the internal orchestration helper; on EC2,
always invoke it through `scripts.staging_runtime` so preflight and secret
validation cannot be accidentally skipped. It is also used directly by the
local disposable smoke harness, which does not require an EBS mount.

The flow is fixed:

1. validate the image reference and EBS mount, then fetch/validate one secret snapshot;
2. make PostgreSQL healthy on persistent EBS;
3. run `python manage.py migrate --no-input` in the one-off migration container;
4. stop if migration fails, without replacing the prior API container;
5. start/replace the long-running API container;
6. wait for database-backed readiness through the loopback-published port.

A successful API replacement may cause a short maintenance interruption. This
environment does not implement blue/green or zero-downtime replacement.
Migration failure does not undo already-applied database changes; backward
compatibility still matters for the prior API. Changing `POSTGRES_PASSWORD` in
Secrets Manager does not rotate the password inside an initialized PostgreSQL
volume; that requires a coordinated database operation.

No persistent `.env` is generated. Container environment values remain visible
to privileged Docker/host operators and may be persisted in Docker metadata on
the encrypted root disk; this is not a guarantee of memory-only secret storage.

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
application shell, missing hashed assets never return that shell (private
S3/OAC can return `403` for a missing object), and direct EC2-origin requests
without CloudFront's secret header are rejected.

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
