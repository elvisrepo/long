package com.viridiandome.longevity.wearables.sync

import java.time.Instant

/** Stores the last successfully completed read-window watermark per connection. */
interface WeightSyncCursorStore {
    suspend fun read(connectionId: String): Instant?

    suspend fun write(
        connectionId: String,
        cursor: Instant,
    )
}
