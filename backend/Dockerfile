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

  CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]