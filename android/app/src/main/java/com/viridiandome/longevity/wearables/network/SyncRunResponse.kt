package com.viridiandome.longevity.wearables.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Read-only receipt returned after Django accepts or replays an upload. */
@Serializable
internal data class SyncRunResponse(
    val id: String,
    @SerialName("connection_id")
    val connectionId: String,
    @SerialName("upload_id")
    val uploadId: String,
    val status: String,
    @SerialName("received_at")
    val receivedAt: String,
    @SerialName("processing_started_at")
    val processingStartedAt: String?,
    @SerialName("finished_at")
    val finishedAt: String?,
    @SerialName("entries_imported")
    val entriesImported: Int,
    @SerialName("entries_skipped")
    val entriesSkipped: Int,
)
