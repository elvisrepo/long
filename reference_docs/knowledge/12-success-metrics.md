###  Success Metrics / KPIs

## Use When
- Load this when you need to check success metrics.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.14.

| KPI | Target | How to measure |
|---|---|---|
| MVP shipped | Within 6 weeks | Deployed, functional, passing tests |
| API p95 latency | < 300ms | Sentry performance monitoring |
| Test coverage | > 80% | `pytest-cov` in CI |
| Zero critical security findings | 0 P0/P1 | `pip-audit` + manual OWASP review |
| Beta users actively logging | 5+ for 2+ weeks | DB query on active users |
| CI/CD pipeline green | 100% on main | GitHub Actions dashboard |
| Uptime (production) | 99.5% | UptimeRobot or CloudWatch |