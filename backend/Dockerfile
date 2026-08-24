FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS python-dependencies

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_LINK_MODE=copy
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY pyproject.toml uv.lock ./


# Local Compose uses this target so pytest, Ruff, and mypy remain available.
FROM python-dependencies AS development

RUN uv sync --frozen

COPY . .


# Build only the locked application dependencies for the deployable image.
FROM python-dependencies AS production-dependencies

RUN uv sync --frozen --no-dev --no-editable


# The final runtime contains Python, the production virtual environment, and
# application source only; build tooling and test source stay in earlier stages.
FROM python:3.14-slim-bookworm AS production

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

RUN addgroup --system django && adduser --system --ingroup django django

COPY --from=production-dependencies /opt/venv /opt/venv
COPY --chown=django:django manage.py ./
COPY --chown=django:django apps ./apps
COPY --chown=django:django common ./common
COPY --chown=django:django config ./config

USER django

# The image defaults to the staging/production WSGI runtime. Local Compose
# explicitly overrides this command with Django's development server.
CMD ["gunicorn", "--bind=0.0.0.0:8000", "--workers=2", "--timeout=30", "--graceful-timeout=30", "--access-logfile=-", "--error-logfile=-", "--env", "DJANGO_SETTINGS_MODULE=config.settings.prod", "config.wsgi:application"]
