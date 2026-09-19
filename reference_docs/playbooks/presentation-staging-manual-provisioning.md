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
returns both options. The public Stripe test webhook endpoint accepts the three
implemented event types, its one-time signing secret is stored only in Secrets
Manager, and a synthetic signed Checkout event was accepted and recorded without
changing the Free subscription. A real hosted Checkout for Pro monthly was then
verified end to end: the attempt is confirmed, the previous Free subscription
is cancelled, the current Pro subscription is active, and Stripe's test-mode
subscription, customer, and price match Django's stored references. This used
the registered public webhook; no local Stripe listener participated. Customer
Portal and cancellation remain to be proved end to end.

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

At this 2026-09-13 checkpoint, CloudFront's S3 frontend and `/api/*` Django
origin were deployed. Section 12 still needed Android and remaining Stripe
proof, and Section 13 backup/restore work had not started. Later checkpoints
below supersede this historical status.

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

Current checkpoint (2026-09-17): the operator reports that the physical Android
staging app connects to the public hosted backend, automatic Weight and Steps
sync works, and the resulting data appears correctly in the hosted frontend.
This closes the Android-to-hosted-frontend functional check by operator report.
On 2026-09-18, a read-only `docker inspect` through Systems Manager confirmed
the running API image as
`173291122778.dkr.ecr.eu-central-1.amazonaws.com/syncvitals/staging/backend@sha256:24edf7e3d5911c72a2565ff5b30b05d4eaeaf0b0eee7c0dac212731179deeb83`.
The owner reports that pilot 1.1 on the authorized Xiaomi 17 Ultra signed in,
connected to Health Connect, synced Samsung Health Weight and Steps over the
hosted HTTPS API, and showed the updated data in the frontend. On-screen
automatic sync after reopening was observed; a roughly 30-minute period with
the app away recorded no worker attempt. Android OS version, network type, and
whether pilot 1.1 was installed as an in-place update were not recorded. On
2026-09-19, the operator confirmed that browser sign-in, session refresh,
manual metric write/read and persistence after refresh, and deep-link reload
all passed on the hosted staging frontend. Together with the previously
recorded health, Stripe, Android, image-identity, and log-privacy evidence, this
closes the Section 12 staging acceptance gate.

#### Watch requests and backend errors on staging

Use the root Session Manager shell on the EC2 host. In one terminal, watch new
Nginx requests; `-F` follows the file across log rotation:

```bash
tail -n 0 -F /var/log/nginx/access.log
```

In two other terminals, watch Nginx errors and the API container's
Gunicorn/Django output respectively:

```bash
tail -n 0 -F /var/log/nginx/error.log
docker logs --since 5m --follow --tail 50 syncvitals-staging-api-1
```

If the shell is not root, use `sudo` for the Nginx files and Docker command.
Open a known `/api/*` page or action in the hosted app and check its method,
path, status, and time in the Nginx access log. The Gunicorn access log should
show the proxied API request; Django errors appear in the same container stream.
Static frontend requests are served by CloudFront/S3, so they do not appear in
these origin logs. The container health probe also creates repeated readiness
entries; distinguish those from user requests by path and timing.

Inspect privately: access logs can include client IPs and full URL query
strings, and application exceptions can include sensitive context. Do not paste
raw logs into chat or tickets. Check representative authenticated and wearable
requests for credentials, tokens, health values, and unexpected tracebacks
before forwarding these logs to a central service. The current Docker `local`
driver bounds container log files to three 10 MiB files; this live view is not
a durable searchable log archive or a failure alert.

On 2026-09-18, the operator confirmed that the Nginx and backend live log
commands work on staging. The operator then checked sign-in and sync requests
and reported that the inspected Nginx and backend logs contained no sensitive
values. This closes the operator-observed log privacy check for those flows;
retained search and failure alerts remain open. Repeat the check after changing
request logging, exception handling, or log shipping.

The next monitoring slice is to send Nginx access/error and API application logs
to three separate CloudWatch Logs groups with short, explicit retention. Keep
the current private host logs, use a narrowly scoped EC2 write policy, and
verify the collected events again for sensitive values. After collection works,
add failure alerts for API 5xx responses and backend/container unavailability.
Check ingestion and retention cost before enabling the log groups; a successful
live `tail` does not itself require CloudWatch Logs charges.

### 13. Back up and restore before calling staging recoverable

- Create a separate private, encrypted, versioned backup bucket.
- Schedule `pg_dump` from the database container to a dated object prefix.
- Publish job success/failure and object-age signals to CloudWatch.
- Restore one backup into a disposable PostgreSQL instance and verify expected
  rows/application queries.

Gate: a successful upload alone is not enough; the documented restore drill
must pass.

Current checkpoint (2026-09-15): the dedicated private, SSE-S3-encrypted,
versioned, HTTPS-only backup bucket exists. The EC2 role has permanent
write-only access below `postgresql/`. One custom-format PostgreSQL dump was
structurally validated, uploaded with SHA-256 metadata, independently inspected
in S3, and restored into an isolated disposable PostgreSQL 16 container. Seven
selected source/restored aggregate row counts matched, the disposable resources
were removed, and the temporary exact-object read permission was deleted.
Daily scheduling, bounded retention, CloudWatch success/failure and object-age
signals, and backup access auditing remain incomplete.

Current checkpoint (2026-09-17): the daily backup timer is active. A separate
monthly timer restores the newest dump into an isolated disposable PostgreSQL
16 container; its manual verification passed with 61 migrations. A successful
restore records its UTC month, and a six-hour systemd heartbeat publishes
`CWAgent/StagingDatabaseRestoreFresh` (`1` current, `0` stale). It accepts the
previous month until 06:00 UTC on day 1 so the monthly job can complete.
`SyncVitalsStagingDatabaseRestoreFailed` detects an explicit failed run;
`SyncVitalsStagingDatabaseRestoreOverdue` is configured for 2 of 2 breaching
six-hour periods, treating missing heartbeat data as breaching. Both notify the
staging SNS topic. The overdue alarm evaluated to `OK`, but a real missed-run
alert has not been exercised. A controlled `SetAlarmState` test did invoke SNS
for both ALARM and metric-driven OK transitions. A temporary isolated alarm
with the same 6-hour, 2-of-2, missing-as-breaching settings and no metric data
naturally entered `ALARM` and invoked SNS; the operator confirmed receiving
that test email. The temporary alarm was deleted, and the live alarm remained
`OK`.
The automated check verifies restoreability,
required tables, and migrations; it does not compare all data rows. See EC2-027
and EC2-028 in the host change log for exact unit, marker, metric, and alarm
names.

## Repeatable Staging Application Release And Rollback

Use this section after initial provisioning. An ordinary application release
does not recreate EC2, EBS, PostgreSQL, Nginx, CloudFront, Route 53, Certbot, or
the registered Stripe webhook.

Release only the component that changed:

| Change | Required deployment |
|---|---|
| React/UI code only | Build and upload the frontend only |
| Django behavior or an endpoint only | Build and deploy a new backend image only |
| Backend contract plus its frontend caller | Deploy a backward-compatible backend first, then the frontend |
| Django model or migration | Backend release; the guarded deployment runs migrations before API replacement |
| Runtime secret/configuration only | Create a new Secrets Manager version and recreate the API with the current image |
| `docker-compose.staging.yml`, `runtime_contract.py`, or host deployment scripts | Review, rebuild, transfer, and install a new deployment bundle; rebuild the backend image too when its runtime contents changed |
| Nginx, CloudFront, DNS, certificate, IAM, or storage topology | Separate infrastructure change with its own preflight, verification, and recovery plan |

### Release Preconditions And Record

Before publishing either component:

1. Work from a reviewed, committed tree. Do not release uncommitted files whose
   contents cannot be recovered from Git.
2. Record the full Git commit SHA, operator, UTC time, intended changes, and
   focused/broad test results.
3. Confirm the AWS account and Region, check the budget alarm, and inspect the
   currently deployed frontend and backend read-only.
4. Preserve the current backend digest and at least one previous accepted ECR
   image. Never delete the only rollback image.
5. Keep all S3, ECR, Secrets Manager, and Systems Manager permissions scoped to
   their staging resources. Use short-lived authenticated sessions and the EC2
   instance role; never copy long-lived AWS credentials onto the host.

Every retained ECR image, S3 object version, upload, request, scan mode, and
CloudFront delivery consumes some AWS storage or request capacity and can add
cost. Retain enough history for safe rollback, then apply reviewed lifecycle
rules rather than deleting the current or previous release ad hoc. AWS documents
that [S3 Versioning stores complete object versions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html),
not byte-level diffs; review [S3 pricing](https://aws.amazon.com/s3/pricing/)
before choosing long-term retention.

### Frontend-Only Release

The frontend is a static Vite build stored in the existing private, encrypted,
versioned S3 bucket and served only through CloudFront. The uploader retains
superseded files, uploads hashed immutable assets first, and uploads the
no-cache application shell last.

From `frontend/`:

```bash
npm ci
npm run format:check
npm run lint
npm test
npm run build

npm run deploy:static -- \
  --bucket syncvitals-staging-frontend-173291122778-eu-central-1-an \
  --dry-run

npm run deploy:static -- \
  --bucket syncvitals-staging-frontend-173291122778-eu-central-1-an
```

Do not use `aws s3 sync --delete`: an older cached application shell may still
reference an older hashed asset. The current CloudFront application-shell cache
policy has zero TTL and `index.html` is uploaded with `no-cache`, so a routine
release should not need a CloudFront invalidation. Investigate configuration or
header drift before using an invalidation as a workaround.

Verify after upload:

1. the public root and one SPA deep link return the application shell;
2. a changed hashed asset is served successfully;
3. `/api/v1/health/live/` and `/api/v1/health/ready/` still return success;
4. browser sign-in and the changed user journey work; and
5. missing assets and API errors do not fall back to the SPA shell.

Frontend rollback:

1. Choose the previous known-good Git commit.
2. Build that commit in a clean temporary worktree or checkout.
3. Run the same tested static uploader. This restores `index.html` and any
   non-hashed root assets while retained hashed objects remain addressable.
4. Repeat the public verification checks and record the rollback.

S3 Versioning remains an additional recovery mechanism for accidental
overwrites, but the current uploader does not emit a complete per-release object
version manifest. Rebuilding the known-good Git commit is therefore the
repeatable whole-build rollback. Do not delete newer S3 versions during an
incident.

### Backend-Only Release

From `backend/`, run focused tests for the touched slice first, then the broad
relevant suite. For route or public-contract changes, update the canonical API,
domain/security, and testing documentation, then search the repository for stale
paths before the broad suite.

Build and push one immutable ARM64 production image. Use a new release tag tied
to the full Git commit SHA; never overwrite or rely on `latest`:

```bash
release_sha="$(git rev-parse HEAD)"
repository="173291122778.dkr.ecr.eu-central-1.amazonaws.com/syncvitals/staging/backend"

docker buildx build \
  --platform linux/arm64 \
  --target production \
  --tag "$repository:$release_sha" \
  --push \
  .

index_digest="$(aws ecr describe-images \
  --repository-name syncvitals/staging/backend \
  --image-ids "imageTag=$release_sha" \
  --region eu-central-1 \
  --query 'imageDetails[0].imageDigest' \
  --output text)"

backend_image="$repository@$index_digest"
printf 'Candidate backend image: %s\n' "$backend_image"

index_manifest="$(aws ecr batch-get-image \
  --repository-name syncvitals/staging/backend \
  --image-ids "imageDigest=$index_digest" \
  --accepted-media-types application/vnd.oci.image.index.v1+json \
  --region eu-central-1 \
  --query 'images[0].imageManifest' \
  --output text)"

arm64_digest="$(printf '%s' "$index_manifest" \
  | uv run --no-project python -c '
import json
import sys

manifest = json.load(sys.stdin)
matches = [
    item["digest"]
    for item in manifest["manifests"]
    if item.get("platform", {}).get("architecture") == "arm64"
    and item.get("platform", {}).get("os") == "linux"
]
if len(matches) != 1:
    raise SystemExit("expected exactly one linux/arm64 image manifest")
print(matches[0])
')"

aws ecr wait image-scan-complete \
  --repository-name syncvitals/staging/backend \
  --image-id "imageDigest=$arm64_digest" \
  --region eu-central-1

aws ecr describe-image-scan-findings \
  --repository-name syncvitals/staging/backend \
  --image-id "imageDigest=$arm64_digest" \
  --region eu-central-1
```

The deployable reference uses the tagged OCI image-index digest. ECR attaches
basic scan findings to its Linux/ARM64 child image manifest rather than the
index or provenance/attestation manifest, so scan `arm64_digest` but deploy
`index_digest`. Stop for an unreviewed critical or high finding. Any
staging-only acceptance must be explicit, dated, scoped, and must not silently
become a production acceptance.

In the root Session Manager shell on EC2, first preserve the current image
reference:

```bash
docker inspect \
  --format '{{.Config.Image}}' \
  syncvitals-staging-api-1
```

Record that digest-qualified value as `previous_backend_image`. Authenticate
Docker to ECR with the instance role, set `BACKEND_IMAGE` to the reviewed new
digest, and invoke the existing guarded deployment:

```bash
registry="173291122778.dkr.ecr.eu-central-1.amazonaws.com"
backend_image="REPLACE_WITH_REVIEWED_DIGEST_QUALIFIED_IMAGE"

cleanup_ecr_auth() {
  docker logout "$registry" >/dev/null 2>&1 || true
}
trap cleanup_ecr_auth EXIT

aws ecr get-login-password --region eu-central-1 \
  | docker login --username AWS --password-stdin "$registry"

export BACKEND_IMAGE="$backend_image"
cd /opt/syncvitals/deployment

python3 -m scripts.staging_runtime \
  --secret-id longevity/staging/backend-runtime \
  --region eu-central-1 \
  -- python3 -m scripts.production_deployment \
  --compose-file docker-compose.staging.yml \
  --project-name syncvitals-staging

cleanup_ecr_auth
trap - EXIT
```

Replace the placeholder with the exact digest-qualified value recorded during
image review; it is not a tag. The EXIT trap removes temporary Docker
authorization after both successful and failed deployments.

The deployment verifies the EBS mount and secret contract, keeps PostgreSQL on
its existing persistent data, runs migrations, stops before API replacement if
the migration command fails, replaces the API, and waits for database-backed
readiness. It can cause a short API interruption because this staging host has
no blue/green deployment.

Verify after promotion:

1. the running API container reports the intended digest-qualified image;
2. only the expected database and API services remain long-running;
3. local host liveness/readiness and public CloudFront liveness/readiness pass;
4. Nginx still rejects direct requests without the origin header;
5. logs contain no secrets, tokens, personal data, or unexpected tracebacks;
6. the changed endpoint and one unchanged authenticated flow work; and
7. the deployment result is appended to the EC2 host change log.

Backend rollback:

1. Set `BACKEND_IMAGE` to `previous_backend_image`.
2. Run the same guarded deployment and verification sequence.
3. Do not assume Django migrations are rolled back. The deployment never
   automatically reverses schema changes, and a reverse migration can destroy
   data.

Backend releases must therefore use backward-compatible expand-and-contract
migrations: first add schema/behavior that both old and new code tolerate,
deploy and migrate data, and remove obsolete schema only in a later release.
When a migration is incompatible with the previous image, recovery requires a
forward fix or a separately reviewed data-restore plan rather than a blind image
rollback.

### Combined Frontend And Backend Release

For a new or changed endpoint consumed by the frontend:

1. Deploy an additive or backward-compatible backend first.
2. Verify the new endpoint through the public CloudFront path.
3. Deploy the frontend that consumes it.
4. Run the complete browser journey.
5. Remove old endpoint/schema behavior only in a later release after old
   browsers and rollback windows no longer require it.

If rollback is required and the new frontend depends on the new backend, roll
back the frontend first. Then roll back the backend only if its database changes
remain compatible with the previous image. A frontend-only failure never
justifies touching PostgreSQL or replacing the backend.

### When The EC2 Deployment Bundle Changes

Normal Django source changes are inside the backend image and do not require a
new host bundle. Rebuild the allowlisted bundle when its Compose file, runtime
contract, storage check, deployment orchestration, or systemd guard changes:

```bash
cd backend
uv run --no-sync python -m scripts.build_staging_bundle \
  --output "/tmp/syncvitals-staging-deployment-$(git rev-parse HEAD).tar.gz"
```

Verify the printed SHA-256, transfer through the operator-controlled path,
inspect the installed files before replacement, and retain a verified copy of
the previous bundle for rollback. Bundle changes are host configuration changes
and must be recorded even when the application image does not change.

## Resume Checklist

When resuming after a pause:

1. Check AWS caller identity and selected region.
2. Check Billing/Free Tier credits and the budget alarm.
3. Read the current checkpoint above and the latest versioned C4 file under
   `reference_docs/knowledge/diagrams/current_aws/`.
4. Inspect existing AWS resources read-only before creating anything.
5. Continue with exactly the first incomplete numbered section.
