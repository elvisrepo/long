### 2.5 Scalability Approach

## Use When
- Load this when you need the project's scale posture, caching stance, worker scaling approach, or when to add replicas and CDN.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 2.5.

- Start vertical (bigger server) — Django monolith handles it
- TimescaleDB compression for older data (automatic, configured per hypertable)
- Redis caching for hot paths (dashboard analytics)
- Celery workers scale horizontally (add more ECS tasks)
- When needed: read replicas for DB, CDN for static assets
