## 9. Monitoring & Maintenance

## Use When
- Load this when you need logging, error tracking, uptime monitoring, analytics, or backup-monitoring references.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 9.

### 9.1 Logging
- Current implementation direction:
  - start with stdout/stderr console logging in Django
  - use a simple formatter and environment-controlled log levels
  - prefer `LOG_LEVEL` for app logs and `DJANGO_LOG_LEVEL` for framework verbosity
- Current implemented baseline:
  - Django `LOGGING` now uses a console handler
  - web login success is logged from `apps.users.views`
  - invalid request warnings already surface through `django.request`
- Why:
  - local development is Docker-based
  - container-friendly logging should go to stdout/stderr, not local files inside the container
  - the same pattern will map cleanly to CloudWatch in the MVP deployment target
- Do not start with:
  - `FileHandler` as the default
  - admin email handlers
  - custom filters unless a concrete need appears
- Add later:
  - structured JSON logging via `python-json-logger`
  - request or correlation IDs
  - broader security-relevant auth event logging
  - CloudWatch shipping in the deployed MVP runtime
  - Sentry for exception tracking

### 9.2 Error Tracking
- **Sentry** — Django + Celery integrations, captures exceptions with full context
- Free tier: 5K events/month (more than enough for MVP)

### 9.3 Uptime Monitoring
- **UptimeRobot** (free) — pings `/api/v1/health/` every 5 min, alerts on failure

### 9.4 Analytics
- **Plausible** (privacy-friendly, no cookies) for frontend page views
- Custom dashboard queries for business metrics (active users, metrics logged/day)

### 9.5 Backups
See §7.5.
