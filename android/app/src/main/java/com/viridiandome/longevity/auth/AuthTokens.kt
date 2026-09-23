package com.viridiandome.longevity.auth

/** JWT pair available only inside the authentication/data layer. */
class AuthTokens(
    val accessToken: String,
    val refreshToken: String,
) {
    override fun toString(): String =
        "AuthTokens(accessPresent=${accessToken.isNotBlank()}, " +
            "refreshPresent=${refreshToken.isNotBlank()})"
}
