package com.viridiandome.longevity.auth

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Stores JWT ciphertext in private SharedPreferences and its AES key in Android Keystore.
 *
 * User authentication is intentionally not required for each key use because future
 * background refresh and wearable upload work must continue while the phone is locked.
 */
class AndroidKeystoreAuthTokenStore(
    context: Context,
    private val preferencesName: String = DEFAULT_PREFERENCES_NAME,
    private val keyAlias: String = DEFAULT_KEY_ALIAS,
) : AuthTokenStore {
    private val preferences: SharedPreferences = context.applicationContext
        .getSharedPreferences(preferencesName, Context.MODE_PRIVATE)

    override suspend fun saveTokens(
        accessToken: String,
        refreshToken: String,
    ) = withContext(Dispatchers.IO) {
        require(accessToken.isNotBlank()) { "Access token must not be blank." }
        require(refreshToken.isNotBlank()) { "Refresh token must not be blank." }

        val key = getOrCreateKey()
        val encryptedAccess = encrypt(
            plaintext = accessToken,
            key = key,
            associatedData = ACCESS_TOKEN_PREFERENCE,
        )
        val encryptedRefresh = encrypt(
            plaintext = refreshToken,
            key = key,
            associatedData = REFRESH_TOKEN_PREFERENCE,
        )

        // Commit both encrypted values in one preference transaction. Login is
        // successful only after durable storage reports success.
        val committed = preferences.edit()
            .putString(ACCESS_TOKEN_PREFERENCE, encryptedAccess)
            .putString(REFRESH_TOKEN_PREFERENCE, encryptedRefresh)
            .commit()
        if (!committed) {
            throw IOException("Unable to persist authentication tokens.")
        }
    }

    override suspend fun readTokens(): AuthTokens? = withContext(Dispatchers.IO) {
        val encryptedAccess = preferences.getString(ACCESS_TOKEN_PREFERENCE, null)
        val encryptedRefresh = preferences.getString(REFRESH_TOKEN_PREFERENCE, null)

        if (encryptedAccess == null && encryptedRefresh == null) {
            return@withContext null
        }
        if (encryptedAccess == null || encryptedRefresh == null) {
            clearTokensSynchronously()
            return@withContext null
        }

        val key = getExistingKey()
        if (key == null) {
            // This can happen after restoring ciphertext onto a different device.
            clearTokensSynchronously()
            return@withContext null
        }

        try {
            AuthTokens(
                accessToken = decrypt(
                    encodedPayload = encryptedAccess,
                    key = key,
                    associatedData = ACCESS_TOKEN_PREFERENCE,
                ),
                refreshToken = decrypt(
                    encodedPayload = encryptedRefresh,
                    key = key,
                    associatedData = REFRESH_TOKEN_PREFERENCE,
                ),
            )
        } catch (_: GeneralSecurityException) {
            clearTokensSynchronously()
            null
        } catch (_: IllegalArgumentException) {
            clearTokensSynchronously()
            null
        }
    }

    override suspend fun clearTokens() = withContext(Dispatchers.IO) {
        clearTokensSynchronously()
    }

    private fun getOrCreateKey(): SecretKey = synchronized(KEY_CREATION_LOCK) {
        getExistingKey() ?: KeyGenerator
            .getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE_PROVIDER)
            .apply {
                init(
                    KeyGenParameterSpec.Builder(
                        keyAlias,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                    )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(AES_KEY_SIZE_BITS)
                        .build(),
                )
            }
            .generateKey()
    }

    private fun getExistingKey(): SecretKey? = KeyStore
        .getInstance(ANDROID_KEYSTORE_PROVIDER)
        .apply { load(null) }
        .getKey(keyAlias, null) as? SecretKey

    private fun encrypt(
        plaintext: String,
        key: SecretKey,
        associatedData: String,
    ): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        cipher.updateAAD(associatedData.toByteArray(Charsets.UTF_8))
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

        return listOf(cipher.iv, ciphertext)
            .joinToString(PAYLOAD_SEPARATOR) { bytes ->
                Base64.encodeToString(bytes, Base64.NO_WRAP)
            }
    }

    private fun decrypt(
        encodedPayload: String,
        key: SecretKey,
        associatedData: String,
    ): String {
        val parts = encodedPayload.split(PAYLOAD_SEPARATOR, limit = 2)
        require(parts.size == 2) { "Invalid encrypted token payload." }
        val initializationVector = Base64.decode(parts[0], Base64.NO_WRAP)
        val ciphertext = Base64.decode(parts[1], Base64.NO_WRAP)

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            key,
            GCMParameterSpec(GCM_TAG_SIZE_BITS, initializationVector),
        )
        cipher.updateAAD(associatedData.toByteArray(Charsets.UTF_8))
        return cipher.doFinal(ciphertext).toString(Charsets.UTF_8)
    }

    private fun clearTokensSynchronously() {
        if (!preferences.edit().clear().commit()) {
            throw IOException("Unable to clear authentication tokens.")
        }
    }

    private companion object {
        const val ANDROID_KEYSTORE_PROVIDER = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val AES_KEY_SIZE_BITS = 256
        const val GCM_TAG_SIZE_BITS = 128
        const val PAYLOAD_SEPARATOR = "."
        const val DEFAULT_PREFERENCES_NAME = "longevity_auth_tokens"
        const val DEFAULT_KEY_ALIAS = "longevity_auth_tokens_key"
        const val ACCESS_TOKEN_PREFERENCE = "access_token_encrypted"
        const val REFRESH_TOKEN_PREFERENCE = "refresh_token_encrypted"
        val KEY_CREATION_LOCK = Any()
    }
}
