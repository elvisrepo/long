package com.viridiandome.longevity

import android.app.Application
import androidx.work.Configuration
import androidx.work.WorkManager
import com.viridiandome.longevity.auth.AndroidKeystoreAuthTokenStore
import com.viridiandome.longevity.auth.AuthRepository
import com.viridiandome.longevity.auth.AuthTokenStore
import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.auth.network.HttpAuthRepository
import com.viridiandome.longevity.subscriptions.SyncPolicyRepository
import com.viridiandome.longevity.subscriptions.network.HttpSyncPolicyRepository
import com.viridiandome.longevity.wearables.DisconnectingWearableConnectionRepository
import com.viridiandome.longevity.wearables.HealthConnectAccess
import com.viridiandome.longevity.wearables.WearableConnectionRepository
import com.viridiandome.longevity.wearables.WearableUploadRepository
import com.viridiandome.longevity.wearables.healthconnect.AndroidHealthConnectAccess
import com.viridiandome.longevity.wearables.network.HttpWearableConnectionRepository
import com.viridiandome.longevity.wearables.network.HttpWearableUploadRepository
import com.viridiandome.longevity.wearables.sync.IncrementalWeightSyncPlanner
import com.viridiandome.longevity.wearables.sync.IncrementalWeightSyncRunner
import com.viridiandome.longevity.wearables.sync.LongevityWorkerFactory
import com.viridiandome.longevity.wearables.sync.SharedPreferencesWeightSyncCursorStore
import com.viridiandome.longevity.wearables.sync.SubscriptionAwareWeightSyncRunner
import com.viridiandome.longevity.wearables.sync.WeightSyncCoordinator
import com.viridiandome.longevity.wearables.sync.WeightSyncCursorStore
import com.viridiandome.longevity.wearables.sync.WeightSyncRunner
import com.viridiandome.longevity.wearables.sync.WeightSyncScheduler
import com.viridiandome.longevity.wearables.sync.WorkManagerWeightSyncScheduler
import okhttp3.OkHttpClient

/**
 * Application-wide dependency container for the small Android MVP.
 *
 * These lazy properties create one shared HTTP client and one authentication
 * repository instead of rebuilding network infrastructure on every recomposition.
 * A dependency-injection framework would add ceremony before this app needs it.
 */
class LongevityApplication : Application(), Configuration.Provider {
    private val httpClient: OkHttpClient by lazy {
        OkHttpClient()
    }

    private val tokenStore: AuthTokenStore by lazy {
        AndroidKeystoreAuthTokenStore(this)
    }

    private val httpAuthRepository: HttpAuthRepository by lazy {
        check(BuildConfig.API_BASE_URL.isNotBlank()) {
            "The production API base URL is not configured."
        }

        HttpAuthRepository(
            client = httpClient,
            baseUrl = BuildConfig.API_BASE_URL,
            tokenStore = tokenStore,
        )
    }

    val authRepository: AuthRepository
        get() = httpAuthRepository

    val authenticatedApiClient: AuthenticatedApiClient by lazy {
        AuthenticatedApiClient(
            client = httpClient,
            tokenStore = tokenStore,
            sessionRefresher = httpAuthRepository,
        )
    }

    val wearableConnectionRepository: WearableConnectionRepository by lazy {
        DisconnectingWearableConnectionRepository(
            delegate = HttpWearableConnectionRepository(
                authenticatedApiClient = authenticatedApiClient,
                baseUrl = BuildConfig.API_BASE_URL,
            ),
            scheduler = weightSyncScheduler,
            cursorStore = weightSyncCursorStore,
        )
    }

    val wearableUploadRepository: WearableUploadRepository by lazy {
        HttpWearableUploadRepository(
            authenticatedApiClient = authenticatedApiClient,
            baseUrl = BuildConfig.API_BASE_URL,
        )
    }

    val syncPolicyRepository: SyncPolicyRepository by lazy {
        HttpSyncPolicyRepository(
            authenticatedApiClient = authenticatedApiClient,
            baseUrl = BuildConfig.API_BASE_URL,
        )
    }

    private val androidHealthConnectAccess by lazy {
        AndroidHealthConnectAccess(this)
    }

    val healthConnectAccess: HealthConnectAccess
        get() = androidHealthConnectAccess

    val weightSyncCursorStore: WeightSyncCursorStore by lazy {
        SharedPreferencesWeightSyncCursorStore(this)
    }

    /** Domain runner shared by WorkManager and any future manual incremental-sync trigger. */
    val incrementalWeightSyncRunner: WeightSyncRunner by lazy {
        val coordinator = WeightSyncCoordinator(
            planner = IncrementalWeightSyncPlanner(
                reader = androidHealthConnectAccess,
                cursorStore = weightSyncCursorStore,
            ),
            uploadRepository = wearableUploadRepository,
        )
        IncrementalWeightSyncRunner(
            delegate = coordinator,
            cursorStore = weightSyncCursorStore,
        )
    }

    /**
     * WorkManager re-checks the current server-owned subscription policy before
     * every run. A downgrade therefore stops background reads even if stale
     * periodic work remains queued temporarily on the phone.
     */
    private val periodicWeightSyncRunner: WeightSyncRunner by lazy {
        SubscriptionAwareWeightSyncRunner(
            policyRepository = syncPolicyRepository,
            delegate = incrementalWeightSyncRunner,
        )
    }

    /** Owns durable device-side scheduling separately from sync business logic. */
    val weightSyncScheduler: WeightSyncScheduler by lazy {
        WorkManagerWeightSyncScheduler(WorkManager.getInstance(this))
    }

    private val longevityWorkerFactory by lazy {
        LongevityWorkerFactory(
            incrementalWeightSyncRunner = { periodicWeightSyncRunner },
        )
    }

    /** Lets WorkManager construct workers that require Longevity domain dependencies. */
    override val workManagerConfiguration: Configuration
        get() =
            Configuration.Builder()
                .setWorkerFactory(longevityWorkerFactory)
                .build()
}
