package com.viridiandome.longevity.wearables.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Exact bounded batch object accepted by Django's wearable upload endpoint. */
@Serializable
internal data class WearableUploadRequest(
    @SerialName("connection_id")
    val connectionId: String,
    @SerialName("upload_id")
    val uploadId: String,
    val entries: List<WearableUploadEntryRequest>,
) {
    override fun toString(): String =
        "WearableUploadRequest(connectionIdPresent=${connectionId.isNotBlank()}, " +
            "uploadIdPresent=${uploadId.isNotBlank()}, entryCount=${entries.size})"
}
