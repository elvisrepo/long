 #!/bin/sh
  set -eu

  DEPS_FINGERPRINT_FILE=".venv/.deps-fingerprint"
  CURRENT_FINGERPRINT="$(sha256sum pyproject.toml uv.lock | sha256sum | awk '{print $1}')"
  PREVIOUS_FINGERPRINT=""

  if [ -f "$DEPS_FINGERPRINT_FILE" ]; then
    PREVIOUS_FINGERPRINT="$(cat "$DEPS_FINGERPRINT_FILE")"
  fi

  if [ ! -x ".venv/bin/python" ] || [ "$PREVIOUS_FINGERPRINT" != "$CURRENT_FINGERPRINT" ]; then
    echo "Syncing Python dependencies..."
    uv sync --frozen
    printf '%s\n' "$CURRENT_FINGERPRINT" > "$DEPS_FINGERPRINT_FILE"
  fi

  uv run python manage.py migrate
  exec uv run python manage.py runserver 0.0.0.0:8000