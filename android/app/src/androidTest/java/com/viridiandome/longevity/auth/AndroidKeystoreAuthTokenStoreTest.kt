package com.viridiandome.longevity.auth

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.security.KeyStore

class AndroidKeystoreAuthTokenStoreTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Before
    fun setUp() {
        deleteTestState()
    }

    @After
    fun tearDown() {
        deleteTestState()
    }

    @Test
    fun tokens_are_encrypted_at_rest_and_can_be_read_then_cleared() = runTest {
        val store = AndroidKeystoreAuthTokenStore(
            context = context,
            preferencesName = TEST_PREFERENCES_NAME,
            keyAlias = TEST_KEY_ALIAS,
        )

        store.saveTokens(
            accessToken = "access-token",
            refreshToken = "refresh-token",
        )

        val storedTokens = store.readTokens()
        assertEquals("access-token", storedTokens?.accessToken)
        assertEquals("refresh-token", storedTokens?.refreshToken)

        // SharedPreferences contains only AES-GCM output and IVs. The
        // non-exportable encryption key remains inside Android Keystore.
        val rawValues = context
            .getSharedPreferences(TEST_PREFERENCES_NAME, Context.MODE_PRIVATE)
            .all
            .values
            .filterIsInstance<String>()
        assertTrue(rawValues.isNotEmpty())
        assertFalse(rawValues.any { it.contains("access-token") })
        assertFalse(rawValues.any { it.contains("refresh-token") })

        store.clearTokens()

        assertNull(store.readTokens())
    }

    private fun deleteTestState() {
        context.deleteSharedPreferences(TEST_PREFERENCES_NAME)

        KeyStore.getInstance(ANDROID_KEYSTORE_PROVIDER).apply {
            load(null)
            if (containsAlias(TEST_KEY_ALIAS)) {
                deleteEntry(TEST_KEY_ALIAS)
            }
        }
    }

    private companion object {
        const val ANDROID_KEYSTORE_PROVIDER = "AndroidKeyStore"
        const val TEST_PREFERENCES_NAME = "longevity_auth_tokens_test"
        const val TEST_KEY_ALIAS = "longevity_auth_tokens_test_key"
    }
}
