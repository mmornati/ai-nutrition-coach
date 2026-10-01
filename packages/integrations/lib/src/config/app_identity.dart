// Who OpenPlate is on the wire. Open Food Facts asks every client to send
// a descriptive User-Agent (app name, version, a way to reach the
// maintainers). No personal email: the project URL is the contact.
//
// TODO(phase-6): replace the placeholder URL with the real repository URL
// once the public remote exists (there is none at the time of writing).

/// The app version sent in the User-Agent. Keep in step with
/// `apps/client/pubspec.yaml`.
const String kOpenPlateVersion = '0.1.0';

/// The project page (placeholder until the public repository exists).
const String kOpenPlateProjectUrl = 'https://github.com/openplate/openplate';

/// `OpenPlate/0.1.0 (+https://github.com/openplate/openplate)`.
const String kOpenPlateUserAgent =
    'OpenPlate/$kOpenPlateVersion (+$kOpenPlateProjectUrl)';
