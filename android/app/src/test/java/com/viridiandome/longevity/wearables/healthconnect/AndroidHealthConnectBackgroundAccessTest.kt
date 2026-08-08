package com.viridiandome.longevity.wearables.healthconnect

import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import com.viridiandome.longevity.wearables.BackgroundReadAccess
import org.junit.Assert.assertSame
import org.junit.Test

class AndroidHealthConnectBackgroundAccessTest {
    @Test
    fun unavailable_feature_cannot_grant_background_read_access() {
        val access = resolveBackgroundReadAccess(
            featureStatus = HealthConnectFeatures.FEATURE_STATUS_UNAVAILABLE,
            grantedPermissions = setOf(
                HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
            ),
        )

        assertSame(BackgroundReadAccess.Unavailable, access)
    }

    @Test
    fun available_feature_without_permission_requires_a_foreground_request() {
        val access = resolveBackgroundReadAccess(
            featureStatus = HealthConnectFeatures.FEATURE_STATUS_AVAILABLE,
            grantedPermissions = emptySet(),
        )

        assertSame(BackgroundReadAccess.PermissionRequired, access)
    }

    @Test
    fun available_feature_with_permission_grants_background_read_access() {
        val access = resolveBackgroundReadAccess(
            featureStatus = HealthConnectFeatures.FEATURE_STATUS_AVAILABLE,
            grantedPermissions = setOf(
                HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
            ),
        )

        assertSame(BackgroundReadAccess.Granted, access)
    }
}
