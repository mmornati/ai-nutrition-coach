// Licence texts for the fonts OpenPlate ships (N5): Roboto (Apache-2.0,
// bundled as the default family) and Noto Sans Symbols (SIL OFL 1.1, served
// from /fallback-fonts/). Registered with Flutter's LicenseRegistry so they
// appear on the licences page (Settings -> About -> Open-source licences).

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show AssetBundle, rootBundle;

/// Asset path + the package name shown on the licences page.
const List<(String package, String asset)> bundledFontLicenses = [
  ('Roboto (font)', 'assets/fonts/LICENSE-Roboto.txt'),
  ('Noto Sans Symbols (font)', 'assets/licenses/OFL-NotoSansSymbols.txt'),
];

void registerBundledFontLicenses({AssetBundle? bundle}) {
  final loader = bundle ?? rootBundle;
  LicenseRegistry.addLicense(() async* {
    for (final (package, asset) in bundledFontLicenses) {
      yield LicenseEntryWithLineBreaks([
        package,
      ], await loader.loadString(asset));
    }
  });
}
