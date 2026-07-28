"""Trusted domain operations for normalized wearable uploads."""

from collections.abc import Mapping, Sequence
from typing import Any, cast
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.wearables.models import SyncRun, WearableConnection
from apps.wearables.payload_hashing import calculate_wearable_payload_hash


@transaction.atomic
def process_wearable_upload(
    *,
    connection: WearableConnection,
    upload_id: UUID,
    entries: Sequence[Mapping[str, Any]],
) -> SyncRun:
    """Persist one validated wearable batch and its terminal receipt."""

    # Serialize ingestion for one connection while its receipt, entries, and
    # latest successful sync state are written as one database transaction.
    locked_connection = WearableConnection.objects.select_for_update().get(
        pk=connection.pk,
    )
    processing_started_at = timezone.now()
    sync_run = SyncRun.objects.create(
        wearable_connection=locked_connection,
        upload_id=upload_id,
        payload_hash=calculate_wearable_payload_hash(entries),
        status=SyncRun.Status.PROCESSING,
        processing_started_at=processing_started_at,
    )

    for entry in entries:
        MetricEntry.objects.create(
            user_id=locked_connection.user_id,
            metric_definition=cast(
                MetricDefinition,
                entry["metric_definition"],
            ),
            value=cast(float, entry["value"]),
            recorded_at=entry["recorded_at"],
            source=str(entry["source"]),
            source_connection=locked_connection,
            external_source_id=cast(
                str,
                entry["external_source_id"],
            ),
        )

    finished_at = timezone.now()
    sync_run.status = SyncRun.Status.SUCCEEDED
    sync_run.finished_at = finished_at
    sync_run.entries_imported = len(entries)
    sync_run.save(
        update_fields=(
            "status",
            "finished_at",
            "entries_imported",
        )
    )

    locked_connection.status = WearableConnection.Status.CONNECTED
    locked_connection.last_synced_at = finished_at
    locked_connection.last_error = ""
    locked_connection.save(
        update_fields=(
            "status",
            "last_synced_at",
            "last_error",
            "updated_at",
        )
    )

    return sync_run
