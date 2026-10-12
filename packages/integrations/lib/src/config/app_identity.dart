// Who OpenPlate is on the wire. Open Food Facts asks every client to send
// a descriptive User-Agent (app name, version, a way to reach the
// maintainers). No personal email: the project URL is the contact.
//
// The project URL is a BUILD-TIME setting (privacy audit PV11):
//
//   --dart-define=OPENPLATE_PROJECT_URL=https://example.org/openplate
//
// There is no public repository yet, so the default is the reserved,
// unresolvable `https://openplate.invalid` (RFC 6761): an honest "not set"
// rather than a real-looking GitHub URL that belongs to somebody else.
// `tools/check_release_posture.dart` refuses a release build
// (`OPENPLATE_BUILD=selfhost|release`) whose URL is still `.invalid`, so it
// cannot be forgotten at release time (docs/release-checklist.md).

/// The app version sent in the User-Agent. Keep in step with
/// `apps/client/pubspec.yaml`.
const String kOpenPlateVersion = '0.1.0';

/// The default project URL: unresolvable on purpose (see above).
const String kDefaultOpenPlateProjectUrl = 'https://openplate.invalid';

/// The project page, from `--dart-define=OPENPLATE_PROJECT_URL`.
const String kOpenPlateProjectUrl = String.fromEnvironment(
  'OPENPLATE_PROJECT_URL',
  defaultValue: kDefaultOpenPlateProjectUrl,
);

/// `OpenPlate/0.1.0 (+https://openplate.invalid)` unless the URL is set.
const String kOpenPlateUserAgent =
    'OpenPlate/$kOpenPlateVersion (+$kOpenPlateProjectUrl)';
