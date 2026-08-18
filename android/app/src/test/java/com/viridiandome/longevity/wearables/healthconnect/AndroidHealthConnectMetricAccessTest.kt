package com.viridiandome.longevity.wearables.healthconnect

import com.viridiandome.longevity.wearables.WeightReadAccess
import org.junit.Assert.assertSame
import org.junit.Test

class AndroidHealthConnectMetricAccessTest {
    @Test
    fun every_supported_metric_permission_is_required() {
        assertSame(
            WeightReadAccess.PermissionRequired,
            resolveSupportedMetricReadAccess(
                grantedPermissions = setOf(WEIGHT_READ_PERMISSION),
            ),
        )
        assertSame(
            WeightReadAccess.PermissionRequired,
            resolveSupportedMetricReadAccess(
                grantedPermissions = setOf(STEPS_READ_PERMISSION),
            ),
        )
        assertSame(
            WeightReadAccess.Granted,
            resolveSupportedMetricReadAccess(
                grantedPermissions = SUPPORTED_METRIC_READ_PERMISSIONS,
            ),
        )
    }
}
