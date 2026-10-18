"""Keep process-local cache state isolated like database state between tests."""

from collections.abc import Iterator

from django.core.cache import cache
import pytest


@pytest.fixture(autouse=True)
def isolate_default_cache() -> Iterator[None]:
    cache.clear()
    yield
    cache.clear()
