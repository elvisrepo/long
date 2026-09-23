package com.viridiandome.longevity.auth.network

import kotlinx.serialization.Serializable

/** JWT values returned after Django validates the stored mobile refresh token. */
@Serializable
class MobileRefreshResponse(
    val access: String,
    val refresh: String? = null,
) {
    override fun toString(): String =
        "MobileRefreshResponse(accessPresent=${access.isNotBlank()}, " +
            "rotatedRefreshPresent=${!refresh.isNullOrBlank()})"
}
