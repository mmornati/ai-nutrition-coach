// OpenAI-compatible BYOK provider (Story 3.3 / FR7).
//
// The v1 default `ByokOpenAiCompatibleProvider` adapter. POSTs
// the photo bytes to the configured OpenAI-compatible chat
// completions endpoint (`$endpointUrl/chat/completions`) as a
// vision user message; parses the JSON response; maps the result
// to a `ByokOutcome`.
//
// Privacy / hygiene (Phase 3):
//   * the photo is sanitised first — real MIME type, EXIF / XMP / IPTC
//     removed, refused when that cannot be guaranteed (`photo_sanitizer`);
//   * the endpoint is validated (https, loopback `http` allowed) and the
//     URL built with `Uri.resolve` (`byok_endpoint`);
//   * connect 10 s / send 30 s / receive 45 s timeouts, the response is
//     streamed and aborted past 2 MiB, at most 20 foods are kept, each name
//     and hint at most 100 characters (the model's output is untrusted).
//
// The user-supplied BYOK key is sent in the `Authorization:
// Bearer <key>` header only — never in a URL query string, never
// in a body, never in a log or error envelope (FR7 / NFR4). The
// adapter's `toString` is redacted; the key never appears in any
// string the adapter produces.
//
// FR13: no biometric identification. Vision is a plain food-
// recognition call; no face detection, no voice print.
//
// HTTP status routing:
//   * 200 → parse `choices[0].message.content` as a JSON array of
//     `{name, quantityHint}` objects. An empty array or a parse
//     failure → `ByokNoMatch`. Any non-empty array → `ByokRecognized`.
//   * 401 / 403 → `ByokKeyRejected`. The key is preserved on disk.
//   * 429 → `ByokQuotaExhausted(resetAt: ...)` from `retry-after` /
//     `X-RateLimit-Reset` when present (`parseRateLimitReset`).
//   * Any other failure → `ByokFailure(cause)`.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:domain_core/domain_core.dart';

import '../net/capped_response.dart';
import 'byok_endpoint.dart';
import 'byok_openai_compatible_provider.dart';
import 'photo_sanitizer.dart';
import 'rate_limit_reset.dart';

/// At most this many foods are kept from one model response.
const int kMaxRecognizedFoods = 20;

/// Longest food name / quantity hint kept (characters).
const int kMaxFoodTextLength = 100;

/// The result of "Test connection" on the Your AI screen. Calm, typed, and
/// free of any key material.
sealed class ByokConnectionResult {
  const ByokConnectionResult();
}

final class ByokConnectionOk extends ByokConnectionResult {
  const ByokConnectionOk();
}

final class ByokConnectionKeyRejected extends ByokConnectionResult {
  const ByokConnectionKeyRejected();
}

final class ByokConnectionRateLimited extends ByokConnectionResult {
  const ByokConnectionRateLimited({this.resetAt});

  final DateTime? resetAt;
}

final class ByokConnectionEndpointInvalid extends ByokConnectionResult {
  const ByokConnectionEndpointInvalid(this.problem);

  final ByokEndpointProblem problem;
}

/// The saved key was entered for another host than the endpoint being
/// tested; it is not used until it is pasted again.
final class ByokConnectionKeyForOtherHost extends ByokConnectionResult {
  const ByokConnectionKeyForOtherHost();
}

/// The response was larger than the 2 MiB cap and was aborted.
final class ByokConnectionResponseTooLarge extends ByokConnectionResult {
  const ByokConnectionResponseTooLarge();
}

/// No endpoint / model / key to test with yet.
final class ByokConnectionNotConfigured extends ByokConnectionResult {
  const ByokConnectionNotConfigured();
}

enum ByokUnreachableReason { timeout, network }

final class ByokConnectionUnreachable extends ByokConnectionResult {
  const ByokConnectionUnreachable(this.reason);

  final ByokUnreachableReason reason;
}

/// The endpoint answered, but not with success (404 model / path, 4xx, 5xx).
final class ByokConnectionUnexpectedStatus extends ByokConnectionResult {
  const ByokConnectionUnexpectedStatus(this.statusCode);

  final int statusCode;
}

/// Port for the "Test connection" button. Separate from
/// `ByokOpenAiCompatibleProvider` so recognition fakes stay small.
abstract interface class ByokConnectionTester {
  Future<ByokConnectionResult> testConnection({required String apiKey});
}

class OpenAiCompatibleByokProvider
    implements ByokOpenAiCompatibleProvider, ByokConnectionTester {
  const OpenAiCompatibleByokProvider({
    this.endpointUrl = '',
    this.model = '',
    Dio? dio,
  }) : _dio = dio;

  /// The OpenAI-compatible endpoint URL (e.g.
  /// `https://openrouter.ai/api/v1`), as the user configured it. Validated
  /// on every call (`ByokEndpoint.validate`). Empty → the rung refuses to
  /// call.
  final String endpointUrl;

  /// The model id the endpoint should serve (e.g.
  /// `google/gemini-2.0-flash-exp:free`).
  final String model;

  /// Injected for tests; production code lets the provider build
  /// its own `Dio` instance (with the product timeouts).
  final Dio? _dio;

  /// The instruction the model receives. Plain English; the model
  /// is asked to return a JSON array — the response is parsed in
  /// `_parseFoods`. The prompt is a constant so a regression in
  /// the wording is caught by code review (Story 3.3's
  /// `BuiokStrings` carries the user-facing copy; this prompt is
  /// transport-only).
  static const String _prompt =
      'Look at the plate in the photo. Return a JSON array of the '
      'foods you see. For each food, return an object with two '
      'string fields: `name` (the food name, plain English) and '
      '`quantityHint` (an honest quantity range the user could '
      'commit to, e.g. "1 piece", "about 2 fists", "~1 cup"). '
      'Return an empty array `[]` if the plate is empty or the '
      'photo is unreadable. Return ONLY the JSON array — no '
      'prose, no markdown fences, no commentary.';

  @override
  Future<ByokOutcome> recognize({
    required Uint8List photoBytes,
    required String apiKey,
  }) async {
    if (endpointUrl.isEmpty || model.isEmpty) {
      return const ByokFailure(
        'The BYOK endpoint or model is not set — open Settings → Your AI.',
      );
    }
    final endpoint = validateByokEndpoint(endpointUrl);
    if (endpoint is! ByokEndpointValid) {
      return const ByokFailure(
        'The BYOK endpoint is not valid — open Settings → Your AI.',
      );
    }

    // N1: nothing leaves the device unless it is a photo whose metadata we
    // could remove, labelled with its real type.
    final photo = sanitizePhotoForUpload(photoBytes);
    if (photo is! SanitizedPhoto) {
      return const ByokFailure(
        'This photo format cannot be sent without its metadata.',
      );
    }

    final body = <String, Object?>{
      'model': model,
      'messages': [
        {
          'role': 'user',
          'content': [
            {'type': 'text', 'text': _prompt},
            {
              'type': 'image_url',
              'image_url': {
                'url': 'data:${photo.mime};base64,${base64Encode(photo.bytes)}',
              },
            },
          ],
        },
      ],
      'max_tokens': 800,
      'temperature': 0.2,
    };

    try {
      final reply = await _post(endpoint.chatCompletions, body, apiKey);
      final status = reply.status;
      if (status == 401 || status == 403) {
        return const ByokKeyRejected();
      }
      if (status == 429) {
        return ByokQuotaExhausted(resetAt: _resetAt(reply.headers));
      }
      if (status < 200 || status >= 300) {
        return ByokFailure('http $status from ${endpoint.host}');
      }
      final data = reply.json;
      if (data is! Map<String, dynamic>) return const ByokNoMatch();
      final text = _extractText(data);
      if (text == null || text.isEmpty) return const ByokNoMatch();
      return _parseFoods(text);
    } on ResponseTooLargeException {
      return const ByokFailure('the provider response was too large');
    } on TimeoutException {
      return ByokFailure('the request to ${endpoint.host} timed out');
    } on DioException catch (e) {
      // Network blip / DNS / TLS / timeout — a generic, key-free line so
      // the rung renders the calm "transport unavailable" copy.
      return ByokFailure(_describeDioFailure(e, endpoint.host));
    } on Object {
      return const ByokFailure('the provider could not be reached');
    }
  }

  @override
  Future<ByokConnectionResult> testConnection({required String apiKey}) async {
    final endpoint = validateByokEndpoint(endpointUrl);
    if (endpoint is ByokEndpointInvalid) {
      return endpointUrl.trim().isEmpty
          ? const ByokConnectionNotConfigured()
          : ByokConnectionEndpointInvalid(endpoint.problem);
    }
    if (endpoint is! ByokEndpointValid) {
      return const ByokConnectionNotConfigured();
    }
    if (model.trim().isEmpty || apiKey.trim().isEmpty) {
      return const ByokConnectionNotConfigured();
    }
    try {
      // The smallest request that proves endpoint + key + model: one token.
      final reply = await _post(
        endpoint.chatCompletions,
        <String, Object?>{
          'model': model,
          'messages': [
            {'role': 'user', 'content': 'ping'},
          ],
          'max_tokens': 1,
          'temperature': 0,
        },
        apiKey,
        receiveTimeout: const Duration(seconds: 20),
      );
      final status = reply.status;
      if (status >= 200 && status < 300) return const ByokConnectionOk();
      if (status == 401 || status == 403) {
        return const ByokConnectionKeyRejected();
      }
      if (status == 429) {
        return ByokConnectionRateLimited(resetAt: _resetAt(reply.headers));
      }
      return ByokConnectionUnexpectedStatus(status);
    } on ResponseTooLargeException {
      return const ByokConnectionResponseTooLarge();
    } on TimeoutException {
      return const ByokConnectionUnreachable(ByokUnreachableReason.timeout);
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      if (code != null) return ByokConnectionUnexpectedStatus(code);
      return ByokConnectionUnreachable(
        _isTimeout(e)
            ? ByokUnreachableReason.timeout
            : ByokUnreachableReason.network,
      );
    } on Object {
      return const ByokConnectionUnreachable(ByokUnreachableReason.network);
    }
  }

  /// One POST with the product timeouts, a streamed + size-capped body, and
  /// the key in the `Authorization` header only.
  Future<({int status, Headers headers, Object? json})> _post(
    Uri uri,
    Map<String, Object?> body,
    String apiKey, {
    Duration receiveTimeout = kReceiveTimeout,
  }) async {
    final dio = _dio ?? createTimeoutDio();
    final cancel = CancelToken();
    final response = await dio.postUri<ResponseBody>(
      uri,
      data: body,
      cancelToken: cancel,
      options: Options(
        headers: {
          'Authorization': 'Bearer ${apiKey.trim()}',
          'Content-Type': 'application/json',
        },
        responseType: ResponseType.stream,
        // A redirect would re-send the Authorization header and the photo
        // to wherever the server points: never follow one; a 3xx is a
        // failure.
        followRedirects: false,
        maxRedirects: 0,
        sendTimeout: kSendTimeout,
        receiveTimeout: receiveTimeout,
        validateStatus: (status) =>
            status != null && status >= 200 && status < 500,
      ),
    );
    final status = response.statusCode ?? 0;
    final stream = response.data;
    Object? json;
    if (stream != null) {
      if (status >= 200 && status < 300) {
        json = await readCappedJson(stream, cancelToken: cancel);
      } else {
        // Error bodies are never read; drop the connection's stream.
        unawaited(stream.stream.listen(null).cancel());
      }
    }
    return (status: status, headers: response.headers, json: json);
  }

  bool _isTimeout(DioException e) =>
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.sendTimeout ||
      e.type == DioExceptionType.receiveTimeout;

  String _describeDioFailure(DioException e, String host) {
    final code = e.response?.statusCode;
    if (code != null) return 'http $code from $host';
    if (_isTimeout(e)) return 'the request to $host timed out';
    return 'could not connect to $host';
  }

  DateTime? _resetAt(Headers headers) =>
      parseRateLimitReset(headers['retry-after']?.first) ??
      parseRateLimitReset(headers['x-ratelimit-reset']?.first);

  /// Extract the assistant text from the OpenAI-compatible chat
  /// completions response shape. Tolerates both
  /// `choices[0].message.content` (string) and the streaming-style
  /// `choices[0].text` shape for older proxies.
  String? _extractText(Map<String, dynamic> data) {
    final choices = data['choices'];
    if (choices is List && choices.isNotEmpty) {
      final first = choices.first;
      if (first is Map) {
        final message = first['message'];
        if (message is Map) {
          final content = message['content'];
          if (content is String) return content;
        }
        final text = first['text'];
        if (text is String) return text;
      }
    }
    return null;
  }

  /// Parse the model's text response as a JSON array of
  /// `{name, quantityHint}` objects. Returns `ByokNoMatch` on any
  /// parse failure or an empty list. The model's output is untrusted:
  /// at most [kMaxRecognizedFoods] entries are kept and every string is
  /// cleaned and capped at [kMaxFoodTextLength].
  ByokOutcome _parseFoods(String text) {
    var jsonText = text.trim();
    // Strip a leading/trailing markdown fence if the model added
    // one despite the prompt.
    final fence = RegExp(r'^```(?:json)?\s*|\s*```$', multiLine: true);
    jsonText = jsonText.replaceAll(fence, '').trim();
    Object? decoded;
    try {
      decoded = json.decode(jsonText);
    } catch (_) {
      // Some models wrap the array in prose; try to find the
      // outer `[` ... `]` slice as a last resort.
      final start = jsonText.indexOf('[');
      final end = jsonText.lastIndexOf(']');
      if (start >= 0 && end > start) {
        try {
          decoded = json.decode(jsonText.substring(start, end + 1));
        } catch (_) {
          return const ByokNoMatch();
        }
      } else {
        return const ByokNoMatch();
      }
    }
    if (decoded is! List) return const ByokNoMatch();
    if (decoded.isEmpty) return const ByokNoMatch();
    final foods = <RecognizedFood>[];
    for (final entry in decoded) {
      if (foods.length >= kMaxRecognizedFoods) break;
      if (entry is! Map) continue;
      final name = _cleanText(entry['name']);
      final hint = _cleanText(entry['quantityHint']);
      if (name == null) continue;
      foods.add(
        RecognizedFood(
          databaseFood: DatabaseFood(
            sourceRef: 'byok-$model-$name',
            displayName: name,
            source: SourceCatalog.manual,
          ),
          confidence: 0.5,
          quantity: QuantityRange(
            low: 1,
            high: 1,
            unit: hint ?? 'serving',
            displayLabel: hint ?? '1 serving',
          ),
        ),
      );
    }
    if (foods.isEmpty) return const ByokNoMatch();
    return ByokRecognized(foods);
  }

  /// Control characters become spaces, runs of whitespace collapse, the
  /// result is capped at [kMaxFoodTextLength] characters. `null` when
  /// nothing printable is left.
  static String? _cleanText(Object? raw) {
    if (raw is! String) return null;
    final cleaned = raw
        .replaceAll(RegExp(r'[\u0000-\u001F\u007F\u0080-\u009F]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (cleaned.isEmpty) return null;
    final runes = cleaned.runes;
    if (runes.length <= kMaxFoodTextLength) return cleaned;
    return String.fromCharCodes(runes.take(kMaxFoodTextLength)).trim();
  }

  /// Redacted `toString` (FR7 / NFR4). Never include the endpoint
  /// URL, the model id, or the key.
  @override
  String toString() =>
      'OpenAiCompatibleByokProvider(endpointUrl: redacted, '
      'model: redacted)';
}
