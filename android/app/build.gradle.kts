import com.android.build.api.variant.HasHostTestsBuilder
import com.android.build.api.variant.HostTestBuilder
import org.gradle.api.DefaultTask
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.TaskAction
import java.io.File
import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val stagingApiBaseUrlProvider = providers
    .gradleProperty("longevity.stagingApiBaseUrl")
    .orElse(providers.environmentVariable("LONGEVITY_STAGING_API_BASE_URL"))
val releaseApiBaseUrlProvider = providers
    .gradleProperty("longevity.releaseApiBaseUrl")
    .orElse(providers.environmentVariable("LONGEVITY_RELEASE_API_BASE_URL"))
val pilotApiBaseUrlProvider = providers
    .gradleProperty("longevity.pilotApiBaseUrl")
    .orElse(providers.environmentVariable("LONGEVITY_PILOT_API_BASE_URL"))
val pilotKeyFile = rootProject.file(".local-signing/pilot-signing.p12")
val pilotPasswordFile = rootProject.file(".local-signing/pilot-password.txt")

fun String.asBuildConfigString(): String =
    "\"${replace("\\", "\\\\").replace("\"", "\\\"")}\""

abstract class ValidateApiBaseUrlTask : DefaultTask() {
    @get:Input
    @get:Optional
    abstract val apiBaseUrl: Property<String>

    @get:Input
    abstract val environmentName: Property<String>

    @get:Input
    abstract val configurationHint: Property<String>

    @TaskAction
    fun validate() {
        val value = apiBaseUrl.orNull
            ?: throw GradleException(
                "Set ${configurationHint.get()} before building ${environmentName.get()}.",
            )
        val uri = runCatching { URI(value) }.getOrElse {
            throw GradleException(
                "The ${environmentName.get()} API base URL must be a valid absolute URI.",
            )
        }
        val isHttpsOriginRoot = uri.scheme == "https" &&
            !uri.host.isNullOrBlank() &&
            uri.rawPath == "/" &&
            uri.rawQuery == null &&
            uri.rawFragment == null &&
            uri.userInfo == null

        if (!isHttpsOriginRoot) {
            throw GradleException(
                "The ${environmentName.get()} API base URL must be an HTTPS origin root ending in / " +
                    "with no credentials, query, or fragment.",
            )
        }
    }
}

abstract class ValidatePilotSigningTask : DefaultTask() {
    @get:Input
    abstract val keyPath: Property<String>

    @get:Input
    abstract val passwordPath: Property<String>

    @TaskAction
    fun validate() {
        if (!File(keyPath.get()).isFile || !File(passwordPath.get()).isFile) {
            throw GradleException("Pilot signing files are missing from android/.local-signing/.")
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
        versionCode = 2
        versionName = "1.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("pilot") {
            if (pilotKeyFile.isFile && pilotPasswordFile.isFile) {
                storeFile = pilotKeyFile
                storePassword = pilotPasswordFile.readText().trim()
                keyAlias = "longevity-pilot"
                keyPassword = storePassword
            }
        }
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
        create("pilot") {
            initWith(getByName("release"))
            applicationIdSuffix = ".pilot"
            versionNameSuffix = "-pilot"
            buildConfigField(
                "String",
                "API_BASE_URL",
                pilotApiBaseUrlProvider.orNull.orEmpty().asBuildConfigString(),
            )
            signingConfig = signingConfigs.getByName("pilot")
        }
        release {
            buildConfigField(
                "String",
                "API_BASE_URL",
                releaseApiBaseUrlProvider.orNull.orEmpty().asBuildConfigString(),
            )
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
    beforeVariants(selector().withBuildType("pilot")) { variantBuilder ->
        (variantBuilder as HasHostTestsBuilder)
            .hostTests[HostTestBuilder.UNIT_TEST_TYPE]
            ?.enable = true
    }
    beforeVariants(selector().withBuildType("staging")) { variantBuilder ->
        (variantBuilder as HasHostTestsBuilder)
            .hostTests[HostTestBuilder.UNIT_TEST_TYPE]
            ?.enable = true
    }
    beforeVariants(selector().withBuildType("release")) { variantBuilder ->
        (variantBuilder as HasHostTestsBuilder)
            .hostTests[HostTestBuilder.UNIT_TEST_TYPE]
            ?.enable = true
    }
}

val validateStagingApiBaseUrl by tasks.registering(ValidateApiBaseUrlTask::class) {
    group = "verification"
    description = "Rejects a missing or unsafe Android staging API base URL."
    apiBaseUrl.set(stagingApiBaseUrlProvider)
    environmentName.set("staging")
    configurationHint.set("-Plongevity.stagingApiBaseUrl=https://staging.<domain>/ or LONGEVITY_STAGING_API_BASE_URL")
}

val validateReleaseApiBaseUrl by tasks.registering(ValidateApiBaseUrlTask::class) {
    group = "verification"
    description = "Rejects a missing or unsafe Android release API base URL."
    apiBaseUrl.set(releaseApiBaseUrlProvider)
    environmentName.set("release")
    configurationHint.set("-Plongevity.releaseApiBaseUrl=https://api.<domain>/ or LONGEVITY_RELEASE_API_BASE_URL")
}

val validatePilotApiBaseUrl by tasks.registering(ValidateApiBaseUrlTask::class) {
    group = "verification"
    description = "Rejects a missing or unsafe Android pilot API base URL."
    apiBaseUrl.set(pilotApiBaseUrlProvider)
    environmentName.set("pilot")
    configurationHint.set("-Plongevity.pilotApiBaseUrl=https://staging.<domain>/ or LONGEVITY_PILOT_API_BASE_URL")
}

val validatePilotSigning by tasks.registering(ValidatePilotSigningTask::class) {
    group = "verification"
    description = "Requires the local pilot signing key and password before packaging."
    keyPath.set(pilotKeyFile.absolutePath)
    passwordPath.set(pilotPasswordFile.absolutePath)
}

tasks.configureEach {
    if (name != validateStagingApiBaseUrl.name && name.contains("Staging")) {
        dependsOn(validateStagingApiBaseUrl)
    }
    if (name != validateReleaseApiBaseUrl.name && name.contains("Release")) {
        dependsOn(validateReleaseApiBaseUrl)
    }
    if (name != validatePilotApiBaseUrl.name && name.contains("Pilot")) {
        dependsOn(validatePilotApiBaseUrl)
    }
    if (name in listOf("assemblePilot", "bundlePilot", "packagePilot")) {
        dependsOn(validatePilotSigning)
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
