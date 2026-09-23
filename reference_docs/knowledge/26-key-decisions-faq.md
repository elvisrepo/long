## Appendix: Key Decisions FAQ

## Use When
- Load this when you need quick answers on local-vs-Docker development, SDLC, API gateway timing, backup timing, MVP-vs-full-architecture stance, or DevOps learning order.

## Source
- Derived from `reference_docs/knowledge/planning.md` appendix.

### Develop locally or on Docker?
**Both.** Develop your Python code locally (fast iteration, IDE support). Run dependencies (Postgres, Redis) in Docker Compose. The Django dev server runs on your machine, connects to containerized services.

### SDLC?
**Kanban** (solo developer). No sprints, no ceremonies. A simple board: Backlog → In Progress → Review → Done. Move cards as you go. Use GitHub Projects.

### API Gateway from the start?
**Locally: No.** Django dev server is fine. **In production: Yes** — ALB in front of ECS handles routing, TLS, and basic DDoS protection.

### Backups immediately?
**In production: Yes, day 1.** Managed DB backups plus logical exports are non-negotiable. **Locally: No** — your data is disposable test data.

### Full architecture vs MVP?
**MVP architecture first**, with the full architecture as a target. Don't build what you don't need yet. The pragmatic MVP (§1.9) includes the essentials (reverse proxy, backups, secrets management, CI/CD) without the expensive stuff (multi-AZ, Kubernetes, autoscaling groups).

### DevOps learning path?
Linux/Bash → Docker → GitHub Actions CI/CD → Terraform → AWS services → CloudWatch monitoring → (later) Kubernetes, Prometheus/Grafana.
