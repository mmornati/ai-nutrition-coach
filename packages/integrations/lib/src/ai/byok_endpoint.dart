// Validation and URL joining for the user-configured BYOK endpoint
// (N7 / S1). The endpoint is typed by the user, so it is untrusted input
// that decides where their key and their photos go:
//
//   * `https` is required — a key over cleartext is a leaked key;
//   * the one exception is a model running on this machine
//     (`localhost`, `127.0.0.1`, `::1`) over plain `http`;
//   * no credentials in the URL (`user:pass@`), and no query string or
//     fragment (a query is where keys leak into logs);
//   * the chat-completions URL is built with `Uri.resolve`, so a trailing
//     slash on the base never produces `//chat/completions`.
//
// Pure Dart. Sealed result, like the rest of the package.

/// Why an endpoint was refused. The UI maps each to calm keyed copy.
enum ByokEndpointProblem {
  empty,
  notAUrl,
  notHttps,
  hasCredentials,
  hasQueryOrFragment,
}

sealed class ByokEndpointValidation {
  const ByokEndpointValidation();
}

/// The endpoint is acceptable. [base] always ends in `/` so it can be
/// resolved against; [host] is what the photo-consent dialog names.
final class ByokEndpointValid extends ByokEndpointValidation {
  const ByokEndpointValid(this.base);

  final Uri base;

  String get host => base.host;

  /// True for a `localhost` / loopback endpoint (a model on this device).
  bool get isLocal => isLoopbackHost(base.host);

  /// `<base>/chat/completions`, tolerant of a trailing slash on [base].
  Uri get chatCompletions => base.resolve('chat/completions');
}

final class ByokEndpointInvalid extends ByokEndpointValidation {
  const ByokEndpointInvalid(this.problem);

  final ByokEndpointProblem problem;
}

/// Validate [raw] (as typed / persisted).
ByokEndpointValidation validateByokEndpoint(String raw) {
  final text = raw.trim();
  if (text.isEmpty) {
    return const ByokEndpointInvalid(ByokEndpointProblem.empty);
  }
  final Uri uri;
  try {
    uri = Uri.parse(text);
  } on FormatException {
    return const ByokEndpointInvalid(ByokEndpointProblem.notAUrl);
  }
  final scheme = uri.scheme.toLowerCase();
  if ((scheme != 'http' && scheme != 'https') ||
      !uri.hasAuthority ||
      uri.host.isEmpty) {
    // `javascript:`, `file:`, `ftp:`, scheme-less strings, `https://`.
    return const ByokEndpointInvalid(ByokEndpointProblem.notAUrl);
  }
  if (scheme == 'http' && !isLoopbackHost(uri.host)) {
    return const ByokEndpointInvalid(ByokEndpointProblem.notHttps);
  }
  if (uri.userInfo.isNotEmpty) {
    return const ByokEndpointInvalid(ByokEndpointProblem.hasCredentials);
  }
  if (uri.hasQuery || uri.hasFragment) {
    return const ByokEndpointInvalid(ByokEndpointProblem.hasQueryOrFragment);
  }
  // Exactly one trailing slash, however many were typed.
  final path = '${uri.path.replaceAll(RegExp(r'/+$'), '')}/';
  return ByokEndpointValid(uri.replace(path: path));
}

/// `localhost`, `127.0.0.1`, `::1` (the host of `http://[::1]:11434`).
bool isLoopbackHost(String host) {
  final h = host.toLowerCase();
  return h == 'localhost' || h == '127.0.0.1' || h == '::1';
}
