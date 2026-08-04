package com.viridiandome.longevity.wearables.network

import kotlinx.serialization.Serializable

/** Exact registration object accepted by Django's wearable connection endpoint. */
@Serializable
internal data class WearableConnectionRegistrationRequest(
    val provider: String,
)
