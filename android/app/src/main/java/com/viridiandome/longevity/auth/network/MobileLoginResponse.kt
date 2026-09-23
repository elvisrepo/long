package com.viridiandome.longevity.auth.network

import kotlinx.serialization.Serializable

/**
 * JWT pair returned by Django's dedicated mobile-login endpoint.
 *
 * Tokens remain readable by the authentication layer but are never included
 * in this object's diagnostic string representation.
 */
@Serializable
class MobileLoginResponse(
    val access: String,
    val refresh: String,
) {
    override fun toString(): String =
        "MobileLoginResponse(accessPresent=${access.isNotBlank()}, " +
            "refreshPresent=${refresh.isNotBlank()})"
}
