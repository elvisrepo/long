FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

  WORKDIR /app

  ENV PYTHONDONTWRITEBYTECODE=1
  ENV PYTHONUNBUFFERED=1
  ENV UV_LINK_MODE=copy
  ENV UV_PROJECT_ENVIRONMENT=/opt/venv
  ENV PATH="/opt/venv/bin:$PATH"

  COPY pyproject.toml uv.lock ./

  RUN uv sync --frozen

  COPY . .

  # The image defaults to the staging/production WSGI runtime. Local Compose
  # explicitly overrides this command with Django's development server.
  CMD ["gunicorn", "--bind=0.0.0.0:8000", "--workers=2", "--timeout=30", "--graceful-timeout=30", "--access-logfile=-", "--error-logfile=-", "--env", "DJANGO_SETTINGS_MODULE=config.settings.prod", "config.wsgi:application"]
