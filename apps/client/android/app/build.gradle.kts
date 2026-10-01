import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing (P3). The keystore and its passwords live outside git:
// create apps/client/android/key.properties (gitignored) with
//   storeFile=/absolute/path/to/upload-keystore.jks
//   storePassword=...
//   keyAlias=...
//   keyPassword=...
// See docs/release-checklist.md. Debug builds never need it.
val keyProperties = Properties()
val keyPropertiesFile = rootProject.file("key.properties")
val hasReleaseKey = keyPropertiesFile.exists()
if (hasReleaseKey) {
    keyPropertiesFile.inputStream().use { keyProperties.load(it) }
}

android {
    namespace = "org.openplate.openplate_client"
    // flutter_secure_storage 11 requires compileSdk 37 (its AAR metadata check
    // fails the build otherwise); Flutter 3.44's default is 36.
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "org.mmornati.ai_nutrition_coach"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                fun required(name: String): String =
                    requireNotNull(keyProperties.getProperty(name)?.takeIf { it.isNotBlank() }) {
                        "android/key.properties is missing '$name' (needs storeFile, " +
                            "storePassword, keyAlias, keyPassword). See docs/release-checklist.md."
                    }
                storeFile = file(required("storeFile"))
                storePassword = required("storePassword")
                keyAlias = required("keyAlias")
                keyPassword = required("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Never fall back to the debug key: a release APK/AAB signed with
            // it is not installable as an update and is not trustworthy.
            if (hasReleaseKey) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

// Fail release builds early, with a clear message, when there is no key.
// Only tasks whose name contains "Release" are checked, so debug and profile
// builds (and `flutter analyze`/tests) are unaffected.
gradle.taskGraph.whenReady {
    val buildingRelease = allTasks.any {
        it.project == project && it.name.contains("Release", ignoreCase = false) &&
            (it.name.startsWith("assemble") || it.name.startsWith("bundle") ||
                it.name.startsWith("package") || it.name.startsWith("sign"))
    }
    if (buildingRelease && !hasReleaseKey) {
        throw GradleException(
            "Release signing is not configured: apps/client/android/key.properties " +
                "is missing. Create it (storeFile, storePassword, keyAlias, keyPassword) " +
                "- see docs/release-checklist.md. Release builds are never signed " +
                "with the debug key.",
        )
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
