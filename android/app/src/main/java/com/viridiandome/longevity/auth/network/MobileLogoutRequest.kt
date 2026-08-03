package com.viridiandome.longevity.auth.network

import kotlinx.serialization.Serializable

/** Exact request body accepted by Django's mobile logout endpoint. */
@Serializable
class MobileLogoutRequest(
    val refresh: String,
) {
    // Never expose the refresh token through logs or assertion diagnostics.
    override fun toString(): String =
        "MobileLogoutRequest(refreshPresent=${refresh.isNotBlank()})"
}
