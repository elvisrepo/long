# Longevity Health Tracker — Complete Project Plan

## Use When

- Load this when you need the high-level product context, target users, functional and non-functional requirements, and core value proposition.

## Source
- Derived from `reference_docs/knowledge/planning.md` sections 1.1, 1.2, 1.3 

## 1. Planning & Requirements

### 1.1 Problem Definition & Audience

**1.1.1 Why am I making this project?**
- To build a sellable health-tracking product that solves a real problem
- To demonstrate senior-level backend engineering across auth, payments, time-series data, real-time streaming, and third-party integrations
- To learn and apply production-grade DevOps practices (Docker, CI/CD, IaC, monitoring)

**1.1.2 Who is this for?**
- Primary: Health-conscious individuals (25–45) tracking longevity metrics (VO2 Max, HRV, resting HR, sleep, body composition)
- Secondary: Biohackers and quantified-self enthusiasts who want one dashboard for all their health data sources

**1.1.3 What makes it valuable?**
- Unified view across manual entries + supported wearable providers (Garmin, Fitbit, Oura, Withings in MVP)
- Long-term trend analysis — not just today's data, but months/years of context
- Clean, premium, dark-mode UX — most health apps are cluttered and ugly

### 1.2 Functional Requirements

**Core features (top 3 — what the system must do):**

1. **Users should be able to log health metrics** — manually enter data points (heart rate, VO2 Max, weight, etc.) with timestamps
2. **Users should be able to view their metrics on a dashboard with trend analytics** — see current values, 7/30/90-day trends, averages, min/max
3. **Users should be able to connect wearable providers** — sync data automatically from supported providers via a server-side aggregator + webhook flow

**Secondary features (needed for a complete product, but not the core system design challenge):**
- Register / login / logout / password reset (auth)
- Subscribe to paid tiers for advanced features (Stripe)
- Export all data / delete account (GDPR compliance)
- Define custom metrics beyond the defaults
- Receive alerts on anomalous values
- Receive live dashboard updates when new wearable data lands (WebSocket)

**Provider scope note:** MVP wearable sync is server-side only for providers with real web APIs, linked through a wearable aggregator. Apple Health, Health Connect, and Samsung Health are explicitly deferred until we commit to a native mobile product.

### 1.3 Non-Functional Requirements

**CAP Theorem: Consistency over Availability.**

Health data must be accurate. If a user logs a metric, it must be persisted correctly every time — we cannot tolerate lost writes or stale reads that show incorrect health data. A brief period of unavailability (seconds during a deploy or failover) is acceptable. A user seeing wrong health data is not.

In practice: single PostgreSQL primary (strong consistency for writes), Redis cache with short TTLs for reads (tolerate slightly stale dashboard data for performance).

| # | Requirement | Target | Why it matters |
|---|---|---|---|
| 1 | **Low-latency analytics queries** | < 200ms p95 for 30-day metric range queries | Users interact with trends constantly — slow charts kill the experience. Drives the TimescaleDB choice. |
| 2 | **Data durability & security** | Zero data loss, field-level encryption for PII, OWASP Top 10 addressed | Health data is sensitive and irreplaceable. Losing it or leaking it destroys trust. |
| 3 | **Consistency for writes** | All metric writes are ACID-committed before returning success | A user logs their blood pressure — it must be there when they check. No eventual consistency for writes. |
| 4 | **GDPR compliance** | Full data export and account deletion without undue delay, within 30 days | Legal requirement for EU users. Must be designed in, not bolted on. |
| 5 | **Availability** | 99.5% uptime (pragmatic MVP) | Important but secondary to consistency. Brief downtime is tolerable; wrong data is not. |

**Capacity estimation**: Deferred. We're building a time-series health tracker — it's a write-moderate, read-heavy system with predictable load. We'll do targeted math if a specific design decision requires it (e.g., partition size, cache sizing).