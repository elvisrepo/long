## 6. Testing

## Use When
- Load this when you need the testing pyramid, tool choices, CI expectations, or coverage targets.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 6.

| Type | Tool | What | When |
|---|---|---|---|
| **Unit** | pytest + pytest-django | Models, services, serializers, validators | Every PR (CI) |
| **Integration** | pytest + DRF `APIClient` | Full API endpoint flows (auth → create metric → query analytics) | Every PR (CI) |
| **E2E** | Playwright | Login → log metric → see on dashboard → export data | Pre-release |
| **Performance** | Locust | Load test: 100 concurrent users, metrics CRUD + analytics queries | Pre-R2 launch |
| **Security** | pip-audit + bandit | Dependency vulnerabilities + code security patterns | Every PR (CI) |

**Coverage target**: 80%+ via `pytest-cov`, enforced in CI.
