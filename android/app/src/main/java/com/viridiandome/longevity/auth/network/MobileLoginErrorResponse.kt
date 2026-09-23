package com.viridiandome.longevity.auth.network

import kotlinx.serialization.Serializable

/**
 * Error body returned when Django rejects a mobile-login request.
 *
 * Server messages are decoded for contract handling, but the UI uses only
 * client-controlled wording so unexpected backend details are not displayed.
 */
@Serializable
class MobileLoginErrorResponse(
    val detail: String? = null,
    val email: List<String> = emptyList(),
    val password: List<String> = emptyList(),
) {
    val userMessage: String
        get() =
            when {
                email.isNotEmpty() && password.isNotEmpty() ->
                    "Enter your email and password."
                email.isNotEmpty() -> "Enter your email."
                password.isNotEmpty() -> "Enter your password."
                detail == "Invalid credentials." -> "Invalid email or password."
                else -> "Unable to sign in. Please try again."
            }
}
