## Architecture Decision Notes

## Use When
- Load this when you need architecture tradeoffs, alternatives considered, accepted downsides, or the rationale behind technical decisions.

## Source
- Derived from current repository implementation choices and project discussions.

### ADR-001: Use Docker Compose for Backend Local Development

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Use Docker Compose as the standard local runtime for backend development.
- Alternatives considered:
  Run Django on the host with locally installed PostgreSQL and Redis.
- Why we chose it:
  Keeps service topology consistent, reduces machine-specific setup drift, and matches the planned local development architecture.
- Downsides:
  Adds Docker-specific debugging and container lifecycle overhead.
- Revisit when:
  The team intentionally moves away from containerized local development.

### ADR-002: Use `backend/.env` as the Single Local Backend Env File

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Keep backend local environment variables in `backend/.env`.
- Alternatives considered:
  Repo-root `.env`, multiple env files, or service-specific env files.
- Why we chose it:
  Keeps the current backend workflow simple and removes ambiguity about which file is authoritative.
- Downsides:
  A future repo-root orchestration setup may require revisiting the convention.
- Revisit when:
  A root-level multi-service runtime becomes the default.

### ADR-003: Use TimescaleDB Instead of Plain PostgreSQL from the Start

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Use a TimescaleDB image for local development instead of plain PostgreSQL.
- Alternatives considered:
  Start with plain PostgreSQL and add Timescale later.
- Why we chose it:
  The roadmap includes time-series analytics and Timescale-specific querying patterns, so adopting it early reduces migration and parity risk.
- Downsides:
  Slightly more specialized infrastructure from day one.
- Revisit when:
  Time-series features are removed from the product direction.

### ADR-004: Use Celery for Application Background Work

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Use Celery for application-level background jobs and scheduled tasks.
- Alternatives considered:
  Cron jobs, systemd timers, ad hoc management commands.
- Why we chose it:
  The product roadmap needs queue-based async execution, retries, and periodic scheduling for webhook handling, backfills, and other non-request work.
- Downsides:
  Adds worker and scheduler infrastructure earlier.
- Revisit when:
  Async requirements remain trivial enough that a task queue is unnecessary.

### ADR-005: Use Redis Instead of RabbitMQ as the Initial Celery Broker

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Use Redis as the initial Celery broker.
- Alternatives considered:
  RabbitMQ.
- Why we chose it:
  Redis is simpler to operate for the current stage and already fits the planned stack for broker and cache use.
- Downsides:
  RabbitMQ offers stronger broker semantics and more advanced routing capabilities.
- Revisit when:
  Delivery guarantees or routing complexity justify a more specialized broker.

### ADR-006: Bake Dependencies into the Image and Bind-Mount Source Code Only

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Install Python dependencies into `/opt/venv` during image build and bind-mount only source code at runtime.
- Alternatives considered:
  Keep the Python environment in `/app/.venv` backed by a named Docker volume and bootstrap it with startup scripts.
- Why we chose it:
  It simplifies container startup, avoids conflicts with the `.:/app` bind mount, and keeps runtime behavior closer to container best practice.
- Downsides:
  Dependency changes require an image rebuild rather than runtime syncing.
- Revisit when:
  Local development needs a different build/runtime tradeoff.

### ADR-007: Use Direct Compose Commands for Celery Services

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Run Celery worker and Celery Beat directly from `docker-compose.yml` commands instead of wrapper startup scripts.
- Alternatives considered:
  Wrapper shell scripts that bootstrap dependencies at container startup.
- Why we chose it:
  Once dependencies are baked into the image, direct commands are simpler, clearer, and less error-prone than extra runtime scripts.
- Downsides:
  Commands become a little longer in Compose.
- Revisit when:
  Application startup logic becomes complex enough to justify dedicated entrypoint scripts again.

### ADR-008: Use Celery Autodiscovery for Django App Tasks

- Status: Accepted
- Date: 2026-03-13
- Decision:
  Use `app.autodiscover_tasks()` instead of hardcoded `include=[...]`.
- Alternatives considered:
  Explicit Celery task module includes.
- Why we chose it:
  This matches normal Django app structure and scales naturally as `accounts`, `metrics`, and future apps add `tasks.py`.
- Downsides:
  Tasks must live in installed Django apps to be discovered automatically.
- Revisit when:
  Non-Django task modules become a primary part of the architecture.
