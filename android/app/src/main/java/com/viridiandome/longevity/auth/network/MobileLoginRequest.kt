package com.viridiandome.longevity.auth.network

import kotlinx.serialization.Serializable

/**
 * Credentials sent to Django's dedicated mobile-login endpoint.
 *
 * This is intentionally a regular class rather than a data class so Kotlin
 * does not generate a toString() that exposes credential values.
 */
@Serializable
class MobileLoginRequest(
    val email: String,
    val password: String,
) {
    // Serialization must include the password for the HTTPS request, so never
    // log the encoded JSON even though this object's toString() is redacted.
    override fun toString(): String =
        "MobileLoginRequest(emailPresent=${email.isNotBlank()}, password=<redacted>)"
}
