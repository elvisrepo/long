## 7. Infrastructure & DevOps

## Use When
- Load this when you need infrastructure planning, CI/CD design, container strategy, secrets handling at the infrastructure level, or production backup policy.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 7.

### 7.1 IaC (Terraform)

> [!NOTE]
> Build the cost-bounded presentation staging environment manually once and
> document every step. Before accepting real production users, provision the
> separate resilient production topology with Terraform; do not clone the
> single-host staging failure domain into production.

#### Current AWS foundation

The initial AWS account and workstation access foundation was completed on
2026-08-20. No Longevity application infrastructure has been provisioned yet.

| Concern | Current decision |
|---|---|
| AWS account | Free plan with promotional credits; treat expiry/depletion as a hard planning constraint |
| Primary Region | `eu-central-1` (Europe/Frankfurt) for staging and production application resources |
| Root user | Passkey/MFA protected, no access keys, emergency/account-only use |
| Human administrator | `sevi-admin`, temporary browser-authenticated AWS CLI sessions, no long-lived access keys |
| Agent inspection | `LongevityAgentViewOnly` assumed role with `ViewOnlyAccess` and one-hour sessions |
| Agent Toolkit | AWS MCP pinned to the Frankfurt endpoint and the view-only profile |
| Cost control | Monthly AWS Budget alert plus manual credit/billing review; neither is a hard cap |

Do not enable AWS Organizations merely as an IAM convenience while this account
must retain its Free-plan promotional credits: the current Free plan terms make
joining or creating an organization an account upgrade that expires those
credits. A single-account IAM model is sufficient for the MVP learning phase.

Identity boundaries are deliberately separate:

- `longevity-staging` is only the local administrator profile alias; it is not an environment or permission boundary.
- `longevity-agent-viewonly` assumes `LongevityAgentViewOnly` and is the profile bound to the AWS MCP.
- GitHub Actions uses OIDC and the narrowly scoped
  `syncvitals-staging-github-deploy-role` for staging deployments; it has no
  long-lived AWS access key.
- production deployment must have a separate role and approval boundary rather than reusing either `sevi-admin` or the staging role.

The AWS MCP is currently configured in proxy `--read-only` mode. This permits
AWS documentation and regional-availability discovery but intentionally hides
generic live-resource API calls. If live inventory becomes necessary, retain
the IAM role's `ViewOnlyAccess` and remove only the proxy restriction. For
resource creation, use reviewed CLI/console steps during the manual staging
exercise, then replace them with Terraform and scoped deployment roles.

Staging runtime identity and secret contract:
- the human `sevi-admin` identity starts an audited Systems Manager session; it
  is not the Django runtime identity
- the EC2 host receives a separate instance-profile role with
  `AmazonSSMManagedInstanceCore` and `secretsmanager:GetSecretValue` restricted
  to `longevity/staging/backend-runtime`; add `kms:Decrypt` only when a
  customer-managed KMS key encrypts that secret
- that role also has send-only SES access for the verified
  `syncvitals.space` identity, restricted to From address
  `no-reply@syncvitals.space`; Django obtains short-lived role credentials
  through required IMDSv2, whose response hop limit is `2` for Docker bridge
  containers
- the host-side loader explicitly ignores workstation profiles, shared AWS
  credential/config files, static/session credentials, web identity, and
  container credential endpoints; the EC2 metadata role is its credential path
- the loader retrieves one `AWSCURRENT` JSON value and passes the validated
  allowlisted snapshot to one deployment command without a persistent `.env`
- the secret values still exist in process/container memory and are visible to
  privileged host or Docker operators; restrict Systems Manager, sudo, and
  Docker access and never print the secret or unredacted Compose configuration
- `longevity/staging/backend-runtime`, the EC2 instance profile, and the staging
  instance are provisioned; the local SES slice adds `SES_REGION`,
  `DEFAULT_FROM_EMAIL`, and `PASSWORD_RESET_URL` to the next runtime snapshot
  and must not be deployed before that secret version and host bundle match

Staging transactional email:
- Amazon SES production access is granted in `eu-central-1`
- `syncvitals.space` is verified with DKIM; custom MAIL FROM
  `bounce.syncvitals.space` has SPF and MX records, and DMARC currently uses
  the monitoring policy `p=none`
- account-level suppression covers bounces and complaints; an SES event
  publishing destination is still recommended for operational alerting
- application delivery uses the SES API through `django-anymail` and boto3's
  default EC2 credential chain, never stored SMTP credentials or AWS keys

Infrastructure progression:

1. Manually provision presentation staging:

- CloudFront as the only public application entry, with private S3/OAC for the React build and uncached `/api/*` forwarding
- one public `t4g.small` EC2 Docker host with an Elastic IP; no ALB or NAT Gateway
- EC2 ingress on TCP 443 only from the CloudFront origin-facing prefix list; no public SSH, Gunicorn, or PostgreSQL port
- Nginx origin TLS and reverse proxy, with a secret CloudFront origin header
- automated Let's Encrypt certificate issuance/renewal through Route 53 DNS-01
- long-lived Django API container plus a one-off migration container from the same immutable image
- plain PostgreSQL 16 container with data on encrypted persistent EBS;
  TimescaleDB is deferred until measured need justifies a tested migration
- scheduled, monitored `pg_dump` backups to a private encrypted versioned S3 bucket and a tested restore procedure
- Secrets Manager, an EC2 instance role, and least-privilege IAM permissions
- AWS Systems Manager access instead of a publicly exposed SSH administration path
- CloudWatch log groups and infrastructure metrics
- private S3 frontend bucket with Block Public Access and CloudFront Origin Access Control
- ACM viewer certificate for CloudFront in `us-east-1`; Let's Encrypt certificate on Nginx for the origin hostname
- Gunicorn as the production WSGI server behind Nginx

2. Encode the recommended production topology in Terraform before real users:

- preserve separate staging and production domains, databases, secrets, and Stripe modes
- use CloudFront/WAF, an ALB across two AZs, two private Fargate API tasks, and RDS PostgreSQL Multi-AZ with point-in-time recovery
- provide resilient private-task egress with one NAT Gateway per AZ
- make production reproducible and avoid copying the staging host's colocated database failure domain
- keep application release automation separate from infrastructure provisioning

3. Introduce asynchronous resources only after a measured requirement:

- ElastiCache Redis
- ECS Fargate Celery Worker
- exactly one ECS Fargate Celery Beat scheduler unless a future distributed scheduler replaces it
- S3 for logical backup artifacts, exports, repair outputs, or application media

Do not provision Redis and worker tasks merely because they exist in local
Compose. The bounded wearable endpoint is currently synchronous and does not
depend on them.

### 7.2 CI/CD (GitHub Actions)

Current implemented state:
- backend CI is now implemented in `.github/workflows/backend-ci.yml`
- backend and frontend CI pin the GitHub-hosted runner to `ubuntu-24.04` rather
  than inheriting future `ubuntu-latest` migrations
- it uses:
  - `actions/checkout` v7.0.1;
  - `actions/setup-python` v7.0.0;
  - `astral-sh/setup-uv` v10.2.0;
  - immutable full commit SHAs, with release comments, rather than mutable
    floating action tags
- it currently runs:
  - `uv sync --group dev`
  - `uv run ruff check .`
  - `uv run mypy`
  - `uv run pytest tests` against a healthy PostgreSQL 16 service
  - `scripts/smoke_prod_image.sh`
  - `uv run python -m scripts.smoke_production_deployment` with a ten-minute
    timeout
- PostgreSQL is required in CI because concurrency coverage depends on real
  row locks; the 2026-09-24 staging-CD verification passed all `484` backend
  tests, and the existing CI gate also runs the complete migration/API smoke
- frontend CI uses Node.js 24 and pins `actions/checkout` v7.0.1 and
  `actions/setup-node` v7.0.0 to immutable full commit SHAs
- both workflows run on every pull request so `backend` and `frontend` can be
  made required branch-protection checks without leaving docs-only pull
  requests permanently pending; their push triggers remain path-filtered to
  avoid unnecessary branch runs
- the active GitHub ruleset `Protect master and staging` requires pull requests,
  current successful `backend` and `frontend` checks, and resolved review
  threads on both branches; it blocks deletion and force-pushes and has no
  bypass actors
- the GitHub `staging` environment accepts deployments only from the protected
  `staging` branch and stores non-secret deployment coordinates as environment
  variables
- AWS IAM now has the GitHub OIDC provider
  `token.actions.githubusercontent.com` with audience `sts.amazonaws.com` and
  the role `syncvitals-staging-github-deploy-role`; its trust requires the exact
  `elvisrepo/long` staging-environment subject and `refs/heads/staging`
- the role's inline `SyncVitalsStagingDeployment` policy is limited to the one
  staging ECR repository, frontend S3 object uploads, and SSM Run Command on the
  one staging instance; it cannot read runtime secrets or mutate IAM, EC2,
  Route 53, or CloudFront
- `.github/workflows/staging-oidc-smoke.yml` is the manual, non-mutating proof
  for that identity boundary; run `35968414547` succeeded from the protected
  `staging` ref and confirmed the expected account and assumed role without
  reading or changing application resources
- `.github/workflows/staging-deploy.yml` automatically deploys `both` after a
  protected push to `staging`; manual dispatch retains `backend`, `frontend`,
  and `both` recovery choices
- every automatic or manual run invokes the reusable backend and frontend CI
  workflows first; the AWS deployment job declares both as dependencies, then
  verifies the host-bundle allowlist definition and its files against the
  reviewed `INSTALLED_HOST_BUNDLE_COMMIT`, validates every deployment coordinate, enters
  the protected `staging` environment, and uses short-lived OIDC credentials
- a host-bundle mismatch fails before AWS authentication and cannot be bypassed
  by a later staging commit; install and verify the matching root-owned EC2
  bundle first, then advance the pinned commit through a separate reviewed
  change
- the non-cancelling concurrency lock permits one running and one pending
  release; newer automatic pushes may replace an older pending run safely
  because the newer `staging` commit contains the earlier protected merges,
  while manual operators still wait for the current run to finish
- backend releases publish one full-commit-tagged Linux/ARM64 production image,
  reuse that immutable tag on a retry, scan its ARM64 child manifest, reject
  every critical and every unreviewed high finding, preserve the previous
  running digest in the job summary, and invoke the existing guarded
  migration-first deployment through SSM
- because ECR basic scan-on-push did not create a scan for Buildx's untagged
  ARM64 child manifest, the workflow explicitly starts a scan only when ECR
  returns `ScanNotFoundException`; retries reuse an existing scan and the role
  therefore also needs repository-scoped `ecr:StartImageScan`
- staging-only high-severity exceptions match the exact CVE, package, and
  reviewed version: zlib `CVE-2026-85091` at `1.3.dfsg+really1.3.1-1`, plus
  Perl `CVE-2026-82560` at `5.40.1-6+deb13u1`; neither is a production
  acceptance and a different package or version fails closed
- frontend releases rerun their complete quality gates and use the tested
  asset-first, application-shell-last uploader; they never delete superseded
  assets, while S3 Versioning retains overwritten object versions
- combined releases deploy and verify the backward-compatible backend before
  uploading the frontend; every release then checks the public root, Sleep deep
  link, liveness, and readiness, and frontend releases compare the public shell
  byte-for-byte with the build output
- credentials are refreshed immediately before backend review/deployment and
  frontend upload; the SSM payload invokes Bash explicitly, has a 900-second
  remote execution timeout, retries transient status lookups through the safe
  delivery/execution window, and also holds a host-level `flock` so another
  command cannot overlap even if the runner loses contact
- the host keeps root-owned current/previous verified-image pointers and
  advances them only after local and public backend health pass; failed
  candidates never replace the usable rollback target, while a same-image
  first run reports that no earlier workflow rollback is available
- verbose migration and Compose output stays in a temporary host log so SSM's
  bounded stdout contains the rollback/running-image markers; failures return
  only the final 7,000 diagnostic bytes, below SSM's 8 KB stderr response
  limit, and the temporary log is removed
- the manual gate succeeded in run `36107967986` after two safely blocked
  attempts; that proof enabled automatic deployment of protected `staging`
  pushes, with `both` selected only after the embedded CI gates pass
- the first automatic attempt, run `36227855262`, passed both CI gates and then
  failed closed before AWS authentication because the runner had not yet loaded
  the repository's Python 3.14 runtime; the pinned project-Python setup fixed
  that runner mismatch without changing the host bundle
- automatic run `36228350062` then deployed protected staging commit
  `e8131b0db0585169186fa8c3543a4366490e4a67`: backend image digest
  `sha256:27ceca8ba7fb24c190e2bdfab1fee8be257f24d154aabce30eb23598a0822e24`
  passed the scan and host deployment, previous digest
  `sha256:ff25974750f22e1e22c93ca35ec4dc86714c9dd3816ae4cfef343ca94d83b804`
  remained the rollback image, the frontend upload completed, and all public
  root, deep-link, liveness, readiness, and byte-for-byte shell checks passed
- authenticated browser journeys remain manual because the workflow receives
  no user credentials, and host deployment-bundle changes remain a separate
  reviewed manual procedure because the GitHub role cannot install host files

```yaml
# .github/workflows/backend-ci.yml (simplified)
name: Backend CI
on: [push, pull_request, workflow_dispatch]
jobs:
  backend:
    runs-on: ubuntu-24.04
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: longevity_ci
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
    env:
      DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/longevity_ci
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0
      - uses: astral-sh/setup-uv@c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0
      - run: uv sync --group dev
      - run: uv run ruff check .
      - run: uv run mypy
      - run: uv run pytest tests
      - run: ./scripts/smoke_prod_image.sh
      - run: uv run python -m scripts.smoke_production_deployment
```

Practical note from the current project:
- local Docker tests use the containerized stack
- GitHub Actions runs Python on the runner and connects Django tests to its
  PostgreSQL 16 service through an explicit `DATABASE_URL`
- raw SQL tests should avoid depending on database-specific storage details when CI and local environments differ
- CI intentionally has no Redis service because the current server request path
  does not require Redis/Celery; add one only with a real integration contract
- PostgreSQL-specific concurrency tests must not fall back to SQLite because
  SQLite does not implement the row-lock semantics being asserted
- staging CD is implemented: manual run `36107967986` proved the full release,
  and automatic run `36228350062` proved that protected `staging` pushes run
  both reusable CI gates before deploying backend and frontend
- the EC2 staging pipeline authenticates through GitHub OIDC rather than
  long-lived AWS keys
- Terraform provisions infrastructure; the deployment pipeline ships a tested application version onto that infrastructure
- deployment must stop when the one-off migration container fails
- staging promotion should require the public liveness check and database readiness check to pass; production additionally requires the ALB health check
- the approved deployment policy permits a short maintenance interruption while
  the single API container is replaced; blue/green, rolling, and other
  zero-downtime promotion mechanisms are not planned requirements
- frontend deployment should publish immutable assets before the browser smoke test
- Android staging builds should use a public HTTPS staging base URL and a private distribution channel such as Play Internal Testing; API base URLs are configuration, not secrets

### 7.3 Containers
- Single backend `Dockerfile` (multi-stage: build → production runtime)
- Docker Compose for local development
- Docker Engine and Compose on manually provisioned EC2 for initial staging
- the same immutable image for `python manage.py migrate --no-input` before the
  Django container is replaced; `uv` remains in build/development stages only
- `docker-compose.production-smoke.yml` and
  `scripts.smoke_production_deployment` exercise that migration-first contract
  with an inert snapshot and disposable database in local and GitHub CI
- Terraform-managed ALB, two Fargate API tasks, one-off migration task, and RDS Multi-AZ for real production users
- Celery Worker and Beat tasks only when measured server workloads justify them
- no Kubernetes for the MVP; its operational cost is unjustified for a solo deployment

Celery Worker, Celery Beat, migrations, and artifact-producing jobs are ordinary
process/container roles and are not specific to Fargate. They could run on EC2;
the project intentionally defers them until post-MVP because current product
requests do not require server-side asynchronous processing.

Logging note:
- local and deployed containers should prefer stdout/stderr logging
- do not default to writing Django logs to local files inside containers
- let Docker handle local log collection and CloudWatch handle the MVP cloud sink later

### 7.4 Secrets
See §3.6.

### 7.5 Backups

> [!IMPORTANT]
> **Yes, backups from day 1.** Presentation staging needs a monitored logical
> backup and restore drill because its database is self-hosted. Production uses
> managed RDS backups and point-in-time recovery, also with restore exercises.

| What | How | Retention |
|---|---|---|
| Staging database | Scheduled `pg_dump` to private encrypted versioned S3 | Define in the runbook; monitor every run and test restoration |
| Production database | RDS automated backups and point-in-time recovery | Define and verify before accepting real users |
| Terraform state / local-development `.env` | Terraform Cloud or S3 + versioning for state; ignored workstation storage for local `.env` | Indefinite for state; local `.env` is not a production backup artifact |
| User uploads (if any) | S3 with versioning | Indefinite |

The Django API process does not own backups. A separate host-scheduled container
creates staging dumps and reports success/failure. Record retention, protect the
bucket from public access, and perform a restore drill before calling staging
recoverable. Production backup retention and restoration belong to the RDS
operational boundary.
