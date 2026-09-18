package com.viridiandome.longevity

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.net.URI

class PilotBuildConfigurationTest {
    @Test
    fun pilot_has_registered_identity_and_https_api_origin() {
        assertEquals("com.viridiandome.longevity.pilot", BuildConfig.APPLICATION_ID)
        assertEquals(2, BuildConfig.VERSION_CODE)
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
