package com.viridiandome.longevity.wearables

import com.viridiandome.longevity.wearables.sync.WeightSyncCursorStore
import com.viridiandome.longevity.wearables.sync.WeightSyncScheduler
import java.io.IOException

/**
 * Adds device cleanup to the server-owned connection lifecycle.
 *
 * Cleanup happens only after Django confirms that the connection is inactive.
 * A failed request therefore cannot accidentally stop a still-active connection.
 */
class DisconnectingWearableConnectionRepository(
    private val delegate: WearableConnectionRepository,
    private val scheduler: WeightSyncScheduler,
    private val cursorStore: WeightSyncCursorStore,
) : WearableConnectionRepository by delegate {
    override suspend fun disconnect(
        connectionId: String,
    ): WearableConnectionDisconnectResult {
        val result = delegate.disconnect(connectionId)
        if (result === WearableConnectionDisconnectResult.Success) {
            scheduler.cancel(connectionId)
            try {
                cursorStore.remove(connectionId)
            } catch (_: IOException) {
                // Django is already authoritative and the connection is inactive.
                // A stale cursor is harmless because reconnect reads with overlap
                // and backend external IDs still deduplicate repeated records.
            }
        }
        return result
    }
}
