package com.viridiandome.longevity

import android.app.Application
import androidx.work.Configuration
import com.viridiandome.longevity.auth.AndroidKeystoreAuthTokenStore
import com.viridiandome.longevity.auth.AuthRepository
import com.viridiandome.longevity.auth.AuthTokenStore
import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.auth.network.HttpAuthRepository
import com.viridiandome.longevity.wearables.HealthConnectAccess
import com.viridiandome.longevity.wearables.WearableConnectionRepository
import com.viridiandome.longevity.wearables.WearableUploadRepository
import com.viridiandome.longevity.wearables.healthconnect.AndroidHealthConnectAccess
import com.viridiandome.longevity.wearables.network.HttpWearableConnectionRepository
import com.viridiandome.longevity.wearables.network.HttpWearableUploadRepository
import com.viridiandome.longevity.wearables.sync.IncrementalWeightSyncPlanner
import com.viridiandome.longevity.wearables.sync.IncrementalWeightSyncRunner
import com.viridiandome.longevity.wearables.sync.InitialWeightSyncPlanner
import com.viridiandome.longevity.wearables.sync.LongevityWorkerFactory
import com.viridiandome.longevity.wearables.sync.SharedPreferencesWeightSyncCursorStore
import com.viridiandome.longevity.wearables.sync.WeightSyncCoordinator
import com.viridiandome.longevity.wearables.sync.WeightSyncCursorStore
import com.viridiandome.longevity.wearables.sync.WeightSyncRunner
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
        HttpWearableConnectionRepository(
            authenticatedApiClient = authenticatedApiClient,
            baseUrl = BuildConfig.API_BASE_URL,
        )
    }

    val wearableUploadRepository: WearableUploadRepository by lazy {
        HttpWearableUploadRepository(
            authenticatedApiClient = authenticatedApiClient,
            baseUrl = BuildConfig.API_BASE_URL,
        )
    }

    private val androidHealthConnectAccess by lazy {
        AndroidHealthConnectAccess(this)
    }

    val healthConnectAccess: HealthConnectAccess
        get() = androidHealthConnectAccess

    val initialWeightSyncCoordinator: WeightSyncCoordinator by lazy {
        WeightSyncCoordinator(
            planner = InitialWeightSyncPlanner(androidHealthConnectAccess),
            uploadRepository = wearableUploadRepository,
        )
    }

    private val weightSyncCursorStore: WeightSyncCursorStore by lazy {
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

    private val longevityWorkerFactory by lazy {
        LongevityWorkerFactory(
            incrementalWeightSyncRunner = { incrementalWeightSyncRunner },
        )
    }

    /** Lets WorkManager construct workers that require Longevity domain dependencies. */
    override val workManagerConfiguration: Configuration
        get() =
            Configuration.Builder()
                .setWorkerFactory(longevityWorkerFactory)
                .build()
}
