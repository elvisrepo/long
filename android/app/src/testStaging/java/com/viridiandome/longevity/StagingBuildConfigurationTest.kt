package com.viridiandome.longevity

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.net.URI

class StagingBuildConfigurationTest {
    @Test
    fun staging_application_id_is_isolated_from_production() {
        assertEquals(
            "com.viridiandome.longevity.staging",
            BuildConfig.APPLICATION_ID,
        )
    }

    @Test
    fun staging_build_is_not_debuggable() {
        assertFalse(BuildConfig.DEBUG)
    }

    @Test
    fun staging_api_base_url_is_a_safe_https_origin_root() {
        val uri = URI(BuildConfig.API_BASE_URL)

        assertEquals("https", uri.scheme)
        assertNotNull(uri.host)
        assertEquals("/", uri.rawPath)
        assertNull(uri.rawQuery)
        assertNull(uri.rawFragment)
        assertNull(uri.userInfo)
    }
}
