// The PWA seams that do not need a browser (ADR-0003): platform detection for
// the install help, the manual signals the widget tests drive, and the inert
// native stubs.

import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';

void main() {
  group('detectInstallPlatform', () {
    const iphone =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
        '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    const ipadDesktopUa =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 '
        '(KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    const android =
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like '
        'Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
    const mac =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

    test('iPhone and iPad are iOS', () {
      expect(detectInstallPlatform(userAgent: iphone), InstallPlatform.ios);
      // iPadOS reports a Mac user agent: the touch screen gives it away.
      expect(
        detectInstallPlatform(userAgent: ipadDesktopUa, maxTouchPoints: 5),
        InstallPlatform.ios,
      );
    });

    test('Android and desktop', () {
      expect(
        detectInstallPlatform(userAgent: android),
        InstallPlatform.android,
      );
      expect(detectInstallPlatform(userAgent: mac), InstallPlatform.desktop);
      expect(detectInstallPlatform(userAgent: ''), InstallPlatform.desktop);
    });
  });

  test('ManualAppUpdateSignal drives the banner seam', () async {
    final signal = ManualAppUpdateSignal();
    expect(signal.updateReady.value, isFalse);
    signal.markReady();
    expect(signal.updateReady.value, isTrue);
    await signal.applyUpdate();
    expect(signal.applyCalls, 1);
  });

  test('native stubs are inert', () async {
    expect(createAppUpdateSignal().updateReady.value, isFalse);
    expect(
      await createStoragePersistence().status(),
      StoragePersistence.unsupported,
    );
    expect(createInstallPrompt().canPrompt, isFalse);
    expect(readInstallContext().standalone, isFalse);
  });

  test('FixedStoragePersistence moves to the post-request state', () async {
    final source = FixedStoragePersistence(
      StoragePersistence.notProtected,
      afterRequest: StoragePersistence.protected,
    );
    expect(await source.status(), StoragePersistence.notProtected);
    expect(await source.request(), StoragePersistence.protected);
    expect(source.requests, 1);
  });

  test('ManualInstallPrompt offers once and is used up by prompting', () async {
    final prompt = ManualInstallPrompt();
    var notified = 0;
    prompt.addListener(() => notified++);
    expect(prompt.canPrompt, isFalse);
    prompt.offer();
    expect(prompt.canPrompt, isTrue);
    await prompt.prompt();
    expect(prompt.prompts, 1);
    expect(prompt.canPrompt, isFalse);
    expect(notified, 2);
  });
}
