"""Trusted domain operations for normalized wearable uploads."""

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any, cast
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.wearables.models import SyncRun, WearableConnection
from apps.wearables.payload_hashing import calculate_wearable_payload_hash

WEARABLE_UPLOAD_CONFLICT_MESSAGE = (
    "upload_id is already associated with a different payload."
)
WEARABLE_RECORD_CONFLICT_MESSAGE = (
    "external_source_id is already associated with different content."
)


class WearableIngestionConflictError(Exception):
    """Base class for safe wearable-ingestion conflict responses."""


class WearableUploadConflictError(WearableIngestionConflictError):
    """The connection-scoped upload ID already represents other content."""


class WearableRecordConflictError(WearableIngestionConflictError):
    """A provider record ID already represents different normalized data."""


def _matches_normalized_entry(
    existing_entry: MetricEntry,
    incoming_entry: Mapping[str, Any],
) -> bool:
    """Compare a stored provider record with already-validated input."""

    definition = cast(
        MetricDefinition,
        incoming_entry["metric_definition"],
    )
    return (
        existing_entry.metric_definition_id == definition.id
        and existing_entry.value == cast(float, incoming_entry["value"])
        and existing_entry.recorded_at
        == cast(datetime, incoming_entry["recorded_at"])
        and existing_entry.source == str(incoming_entry["source"])
    )


@transaction.atomic
def process_wearable_upload(
    *,
    connection: WearableConnection,
    upload_id: UUID,
    entries: Sequence[Mapping[str, Any]],
) -> tuple[SyncRun, bool]:
    """Return the terminal run and whether this call created it."""

    # Serialize ingestion for one connection while its receipt, entries, and
    # latest successful sync state are written as one database transaction.
    locked_connection = WearableConnection.objects.select_for_update().get(
        pk=connection.pk,
    )
    payload_hash = calculate_wearable_payload_hash(entries)

    # One connection-scoped upload ID permanently identifies one payload.
    existing_sync_run = SyncRun.objects.filter(
        wearable_connection=locked_connection,
        upload_id=upload_id,
    ).first()
    if existing_sync_run is not None:
        if existing_sync_run.payload_hash != payload_hash:
            raise WearableUploadConflictError(
                WEARABLE_UPLOAD_CONFLICT_MESSAGE
            )

        # An exact network retry reuses its terminal receipt without writes.
        return existing_sync_run, False

    processing_started_at = timezone.now()
    sync_run = SyncRun.objects.create(
        wearable_connection=locked_connection,
        upload_id=upload_id,
        payload_hash=payload_hash,
        status=SyncRun.Status.PROCESSING,
        processing_started_at=processing_started_at,
    )

    # WearableUploadBatchSerializer has already validated and normalized every
    # entry. Load all matching stored records in one query so the loop below
    # does not issue one database query per uploaded entry.
    existing_entries_by_external_id: dict[str, MetricEntry] = {}
    external_source_ids = [
        cast(str, entry["external_source_id"]) for entry in entries
    ]
    for existing_entry in MetricEntry.objects.filter(
        source_connection=locked_connection,
        external_source_id__in=external_source_ids,
    ):
        if existing_entry.external_source_id is not None:
            existing_entries_by_external_id[
                existing_entry.external_source_id
            ] = existing_entry

    entries_imported = 0
    entries_skipped = 0
    for entry in entries:
        external_source_id = cast(str, entry["external_source_id"])

        # The provider record ID is unique within one wearable connection.
        existing_entry = existing_entries_by_external_id.get(
            external_source_id
        )

        if existing_entry is not None:
            # An equivalent normalized record was imported earlier, so count
            # it without inserting it again.
            if _matches_normalized_entry(existing_entry, entry):
                entries_skipped += 1
                continue

            # Do not silently rewrite provider history when the stable record
            # identity arrives with changed normalized content.
            raise WearableRecordConflictError(
                WEARABLE_RECORD_CONFLICT_MESSAGE
            )

        # No stored external ID means this is a new record and can be inserted.
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
            external_source_id=external_source_id,
        )
        entries_imported += 1

    finished_at = timezone.now()
    sync_run.status = SyncRun.Status.SUCCEEDED
    sync_run.finished_at = finished_at
    sync_run.entries_imported = entries_imported
    sync_run.entries_skipped = entries_skipped
    sync_run.save(
        update_fields=(
            "status",
            "finished_at",
            "entries_imported",
            "entries_skipped",
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

    return sync_run, True
