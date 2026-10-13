// Non-web stubs for `pwa_platform.dart` (native builds, the Dart VM tests).

import 'pwa_platform.dart';

AppUpdateSignal createAppUpdateSignal() => const NoAppUpdateSignal();

StoragePersistenceSource createStoragePersistence() =>
    FixedStoragePersistence(StoragePersistence.unsupported);

InstallPrompt createInstallPrompt() => NoInstallPrompt();

InstallContext readInstallContext() =>
    const InstallContext(platform: InstallPlatform.desktop, standalone: false);
