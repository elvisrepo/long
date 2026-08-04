package com.viridiandome.longevity.wearables.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Caller-owned wearable connection returned by Django's connection endpoints.
 *
 * The Android properties use idiomatic camelCase while [SerialName] preserves
 * the backend's snake_case JSON contract. Timestamps stay as ISO-8601 strings
 * until presentation or Health Connect behavior requires typed date handling.
 */
@Serializable
data class WearableConnectionResponse(
    val id: String,
    val provider: String,
    val status: String,
    @SerialName("last_synced_at")
    val lastSyncedAt: String?,
    @SerialName("last_error")
    val lastError: String,
    @SerialName("created_at")
    val createdAt: String,
    @SerialName("updated_at")
    val updatedAt: String,
)
