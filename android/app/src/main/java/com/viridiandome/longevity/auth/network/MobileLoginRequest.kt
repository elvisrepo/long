package com.viridiandome.longevity.auth.network

/**
 * Credentials sent to Django's dedicated mobile-login endpoint.
 *
 * This is intentionally a regular class rather than a data class so Kotlin
 * does not generate a toString() that exposes credential values.
 */
class MobileLoginRequest(
    val email: String,
    val password: String,
) {
    override fun toString(): String =
        "MobileLoginRequest(emailPresent=${email.isNotBlank()}, password=<redacted>)"
}
