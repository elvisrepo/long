## 8. Production Deployment

## Use When
- Load this when you need production hosting decisions, domain and SSL setup, runtime environment rules, CDN strategy, migration procedure, or rate limiting and DDoS protection.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 8.

### 8.1 Hosting

| Component | Service | Why |
|---|---|---|
| **Backend** | AWS ECS Fargate + ALB | Managed containers, clear path to workers + WebSockets |
| **Database** | Timescale Cloud (PostgreSQL + TimescaleDB) | Managed TimescaleDB without unsupported RDS extension assumptions |
| **Cache** | AWS ElastiCache (Redis) | Managed, automatic failover |
| **Static/Media** | S3 + CloudFront CDN | Global delivery, cheap storage |
| **Frontend** | Vercel or CloudFront + S3 | Free tier, global CDN, auto-deploy from git |

### 8.2 Domain & SSL
- Domain via Route53 or Cloudflare
- SSL auto-provisioned by ALB (ACM certificate)

### 8.3 Production Environment
- `DEBUG=False`, `ALLOWED_HOSTS` set, `SECURE_*` Django settings
- Secrets from AWS Secrets Manager (not env vars baked in image)
- Gunicorn (WSGI) + Uvicorn (ASGI for Channels)

### 8.4 CDN
- CloudFront in front of S3 for static files (`collectstatic`)
- Cache headers configured per file type

### 8.5 Database Migrations in Production
```bash
# Run as a one-off ECS task before deploy
python manage.py migrate --no-input
```

### 8.6 Rate Limiting & DDoS
- AWS WAF on ALB (basic DDoS protection)
- Django-level rate limiting (`django-ratelimit`) for auth endpoints
- CloudFront for static asset protection
