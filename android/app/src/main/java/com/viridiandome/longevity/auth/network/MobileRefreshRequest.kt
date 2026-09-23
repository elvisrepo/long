package com.viridiandome.longevity.auth.network

import kotlinx.serialization.Serializable

/** JSON body accepted by Django's dedicated mobile-refresh endpoint. */
@Serializable
class MobileRefreshRequest(
    val refresh: String,
) {
    // Never let the default object representation expose the stored JWT.
    override fun toString(): String =
        "MobileRefreshRequest(refreshPresent=${refresh.isNotBlank()})"
}
