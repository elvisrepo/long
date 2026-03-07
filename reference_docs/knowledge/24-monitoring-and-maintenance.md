## 9. Monitoring & Maintenance

## Use When
- Load this when you need logging, error tracking, uptime monitoring, analytics, or backup-monitoring references.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 9.

### 9.1 Logging
- **Structured JSON logging** via `python-json-logger`
- Shipped to CloudWatch Logs (MVP) → ELK or Loki (later)
- Request ID traced through all logs

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
