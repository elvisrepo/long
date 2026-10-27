"""Contract tests for the deployable presentation-staging Compose model.

Scenario list:

- pull one externally supplied backend image for migration and API
- persist PostgreSQL 16 data on the encrypted host EBS mount
- keep PostgreSQL unpublished and expose Gunicorn only on host loopback
- run migrations and API with one canonical runtime environment
- wait for PostgreSQL health and probe Django readiness
- restart long-running services without turning migration into a daemon
- keep the AI worker and Redis private; exclude development builds and env files
"""

from pathlib import Path

from config.settings.production_environment import REQUIRED_ENVIRONMENT_VARIABLES


BACKEND_DIR = Path(__file__).resolve().parents[1]
STAGING_COMPOSE_FILE = BACKEND_DIR / "docker-compose.staging.yml"
POSTGRES_IMAGE = (
    "postgres:16@sha256:"
    "f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94"
)


def service_block(compose: str, service: str) -> str:
    """Return one top-level Compose service block."""

    lines = compose.splitlines()
    start = lines.index(f"  {service}:")
    block: list[str] = []
    for line in lines[start + 1 :]:
        if line.startswith("  ") and not line.startswith("    "):
            break
        block.append(line)
    return "\n".join(block)


def test_migration_and_api_pull_same_required_backend_image() -> None:
    compose = STAGING_COMPOSE_FILE.read_text()

    assert 'image: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"' in compose
    assert compose.count("<<: *backend-image") == 3
    assert "build:" not in compose


def test_postgresql_uses_pinned_image_and_persistent_host_storage() -> None:
    compose = STAGING_COMPOSE_FILE.read_text()
    database = service_block(compose, "database")

    assert f'image: "{POSTGRES_IMAGE}"' in database
    assert "source: /srv/syncvitals/postgresql" in database
    assert "target: /var/lib/postgresql/data" in database
    assert "ports:" not in database
    assert "tmpfs:" not in database


def test_api_is_exposed_only_to_host_nginx_over_loopback() -> None:
    compose = STAGING_COMPOSE_FILE.read_text()
    api = service_block(compose, "api")

    assert '"127.0.0.1:18000:8000"' in api
    assert '"0.0.0.0:' not in api


def test_migration_and_api_share_only_canonical_django_environment() -> None:
    compose = STAGING_COMPOSE_FILE.read_text()
    migration = service_block(compose, "migration")
    api = service_block(compose, "api")

    assert "x-backend-environment: &backend-environment" in compose
    assert compose.count("environment: *backend-environment") == 3
    assert "env_file:" not in compose
    assert '  STRETCH_IMAGE_BUCKET: "${STRETCH_IMAGE_BUCKET:-}"' in compose
    for key in REQUIRED_ENVIRONMENT_VARIABLES:
        required = f'  {key}: "${{{key}:?{key} is required}}"'
        assert required in compose
    assert "POSTGRES_PASSWORD" not in migration
    assert "POSTGRES_PASSWORD" not in api


def test_migration_and_api_wait_for_healthy_postgresql() -> None:
    compose = STAGING_COMPOSE_FILE.read_text()
    database = service_block(compose, "database")

    assert "pg_isready -U longevity -d longevity" in database
    assert compose.count("condition: service_healthy") == 5


def test_api_health_check_uses_database_readiness_and_https_metadata() -> None:
    compose = STAGING_COMPOSE_FILE.read_text()
    api = service_block(compose, "api")

    assert "/api/v1/health/ready/" in api
    assert '"X-Forwarded-Proto": "https"' in api
    assert "start_period:" in api


def test_only_required_long_running_services_restart() -> None:
    compose = STAGING_COMPOSE_FILE.read_text()
    database = service_block(compose, "database")
    migration = service_block(compose, "migration")
    api = service_block(compose, "api")

    assert "restart: unless-stopped" in database
    assert "restart: unless-stopped" in api
    assert "restart:" not in migration
    assert "restart: unless-stopped" in service_block(compose, "redis")
    assert "restart: unless-stopped" in service_block(compose, "worker")


def test_ai_worker_and_broker_are_private_and_gate_api_startup() -> None:
    compose = STAGING_COMPOSE_FILE.read_text()
    worker = service_block(compose, "worker")
    redis = service_block(compose, "redis")
    api = service_block(compose, "api")
    assert "ports:" not in redis and "ports:" not in worker
    assert "<<: *backend-image" in worker
    assert "environment: *backend-environment" in worker
    assert "celery" in worker and "--concurrency=1" in worker
    assert "worker:" in api and "condition: service_healthy" in api
    assert "redis://redis:6379/0" in compose
    assert "redis-cli" in redis and "ping" in redis
    assert "healthcheck:" in worker


def test_staging_uses_the_validated_ai_model_for_all_backend_services() -> None:
    compose = STAGING_COMPOSE_FILE.read_text()
    assert (
        "  NVIDIA_INSIGHTS_MODEL: nvidia/nemotron-3.5-super-vl-120b-a12b"
        in compose
    )
    assert compose.count("environment: *backend-environment") == 3
