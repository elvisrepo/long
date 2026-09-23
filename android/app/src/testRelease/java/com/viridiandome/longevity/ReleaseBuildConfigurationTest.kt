package com.viridiandome.longevity

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.net.URI

class ReleaseBuildConfigurationTest {
    @Test
    fun release_uses_production_identity_and_https_api_origin() {
        assertEquals("com.viridiandome.longevity", BuildConfig.APPLICATION_ID)
        assertFalse(BuildConfig.DEBUG)

        val uri = URI(BuildConfig.API_BASE_URL)
        assertEquals("https", uri.scheme)
        assertNotNull(uri.host)
        assertEquals("/", uri.rawPath)
        assertNull(uri.rawQuery)
        assertNull(uri.rawFragment)
        assertNull(uri.userInfo)
    }
}
