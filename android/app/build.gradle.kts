import com.android.build.api.variant.HasHostTestsBuilder
import com.android.build.api.variant.HostTestBuilder
import org.gradle.api.DefaultTask
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.TaskAction
import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val stagingApiBaseUrlProvider = providers
    .gradleProperty("longevity.stagingApiBaseUrl")
    .orElse(providers.environmentVariable("LONGEVITY_STAGING_API_BASE_URL"))

fun String.asBuildConfigString(): String =
    "\"${replace("\\", "\\\\").replace("\"", "\\\"")}\""

abstract class ValidateStagingApiBaseUrlTask : DefaultTask() {
    @get:Input
    @get:Optional
    abstract val apiBaseUrl: Property<String>

    @TaskAction
    fun validate() {
        val value = apiBaseUrl.orNull
            ?: throw GradleException(
                "Set -Plongevity.stagingApiBaseUrl=https://staging.<domain>/ " +
                    "or LONGEVITY_STAGING_API_BASE_URL before building staging.",
            )
        val uri = runCatching { URI(value) }.getOrElse {
            throw GradleException("The staging API base URL must be a valid absolute URI.")
        }
        val isHttpsOriginRoot = uri.scheme == "https" &&
            !uri.host.isNullOrBlank() &&
            uri.rawPath == "/" &&
            uri.rawQuery == null &&
            uri.rawFragment == null &&
            uri.userInfo == null

        if (!isHttpsOriginRoot) {
            throw GradleException(
                "The staging API base URL must be an HTTPS origin root ending in / " +
                    "with no credentials, query, or fragment.",
            )
        }
    }
}

android {
    namespace = "com.viridiandome.longevity"
    compileSdk {
        version = release(37) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.viridiandome.longevity"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            // adb reverse maps the phone's loopback port to Django on this machine.
            buildConfigField("String", "API_BASE_URL", "\"http://127.0.0.1:8000/\"")
        }
        create("staging") {
            initWith(getByName("release"))
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField(
                "String",
                "API_BASE_URL",
                stagingApiBaseUrlProvider.orNull.orEmpty().asBuildConfigString(),
            )
            // Direct-device smoke only. Play Internal Testing requires a
            // dedicated upload-signing boundary before distribution.
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            // Deliberately unset until the production API has a real HTTPS hostname.
            buildConfigField("String", "API_BASE_URL", "\"\"")
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        buildConfig = true
        compose = true
    }
}

androidComponents {
    beforeVariants(selector().withBuildType("staging")) { variantBuilder ->
        (variantBuilder as HasHostTestsBuilder)
            .hostTests[HostTestBuilder.UNIT_TEST_TYPE]
            ?.enable = true
    }
}

val validateStagingApiBaseUrl by tasks.registering(ValidateStagingApiBaseUrlTask::class) {
    group = "verification"
    description = "Rejects a missing or unsafe Android staging API base URL."
    apiBaseUrl.set(stagingApiBaseUrlProvider)
}

tasks.configureEach {
    if (name != validateStagingApiBaseUrl.name && name.contains("Staging")) {
        dependsOn(validateStagingApiBaseUrl)
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.health.connect.client)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.okhttp.coroutines)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.mockwebserver)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.work.testing)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
