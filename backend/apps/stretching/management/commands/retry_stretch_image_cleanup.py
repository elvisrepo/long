from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.core.management.base import CommandParser
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.stretching.models import StretchImageCleanup
from apps.stretching.storage import (
    ImageStorageUnavailable,
    delete_stretch_image_object,
)


class Command(BaseCommand):
    help = "Retry deletion of private stretch images queued for cleanup."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Maximum cleanup records to process (default: 100).",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        limit = options["limit"]
        if limit < 1:
            raise CommandError("--limit must be at least 1.")

        cleanup_ids = list(
            StretchImageCleanup.objects.order_by(
                F("last_attempt_at").asc(nulls_first=True), "queued_at", "id"
            ).values_list("id", flat=True)[:limit]
        )
        deleted = 0
        failed = 0

        for cleanup_id in cleanup_ids:
            with transaction.atomic():
                cleanup = (
                    StretchImageCleanup.objects.select_for_update()
                    .filter(pk=cleanup_id)
                    .first()
                )
                if cleanup is None:
                    continue
                try:
                    delete_stretch_image_object(cleanup.object_key)
                except ImageStorageUnavailable:
                    cleanup.attempt_count += 1
                    cleanup.last_attempt_at = timezone.now()
                    cleanup.save(update_fields=["attempt_count", "last_attempt_at"])
                    failed += 1
                else:
                    cleanup.delete()
                    deleted += 1

        self.stdout.write(
            f"Processed {deleted + failed} cleanup records: "
            f"{deleted} deleted, {failed} still queued."
        )
