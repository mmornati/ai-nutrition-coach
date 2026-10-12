// OpenAI-compatible BYOK provider (Story 3.3 / FR7).
//
// The v1 default `ByokOpenAiCompatibleProvider` adapter. POSTs
// the photo bytes to the configured OpenAI-compatible chat
// completions endpoint (`$endpointUrl/chat/completions`) as a
// vision user message; parses the JSON response; maps the result
// to a `ByokOutcome`.
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
//   * 429 → `ByokQuotaExhausted(resetAt: ...)` from
//     `X-RateLimit-Reset` / `retry-after` when present.
//   * Any other failure → `ByokFailure(cause)`.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:domain_core/domain_core.dart';

import 'byok_openai_compatible_provider.dart';

class OpenAiCompatibleByokProvider implements ByokOpenAiCompatibleProvider {
  const OpenAiCompatibleByokProvider({
    this.endpointUrl = '',
    this.model = '',
    this._dio,
  });

  /// The OpenAI-compatible endpoint URL (e.g.
  /// `https://openrouter.ai/api/v1`). Build-time configuration.
  /// Empty in tests; the rung refuses to call when the URL is
  /// empty.
  final String endpointUrl;

  /// The model id the endpoint should serve (e.g.
  /// `google/gemini-2.0-flash-exp:free`). Build-time configuration.
  final String model;

  /// Injected for tests; production code lets the provider build
  /// its own `Dio` instance.
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
        'OpenAI-compatible BYOK provider is not configured. '
        'Pass --dart-define=AI_NUTRITION_COACH_BYOK_ENDPOINT_URL=... '
        '--dart-define=AI_NUTRITION_COACH_BYOK_MODEL=... at run time.',
      );
    }

    final dio = _dio ?? Dio();
    final base = base64Encode(photoBytes);
    final body = <String, Object?>{
      'model': model,
      'messages': [
        {
          'role': 'user',
          'content': [
            {'type': 'text', 'text': _prompt},
            {
              'type': 'image_url',
              'image_url': {'url': 'data:image/jpeg;base64,$base'},
            },
          ],
        },
      ],
      'max_tokens': 800,
      'temperature': 0.2,
    };

    try {
      final response = await dio.post<Map<String, dynamic>>(
        '$endpointUrl/chat/completions',
        data: body,
        options: Options(
          headers: {
            'Authorization': 'Bearer $apiKey',
            'Content-Type': 'application/json',
          },
          responseType: ResponseType.json,
          validateStatus: (status) =>
              status != null && status >= 200 && status < 500,
        ),
      );
      final status = response.statusCode ?? 0;
      if (status == 401 || status == 403) {
        return const ByokKeyRejected();
      }
      if (status == 429) {
        final resetAt = _parseResetAt(response);
        return ByokQuotaExhausted(resetAt: resetAt);
      }
      if (status < 200 || status >= 300) {
        return ByokFailure('http $status from $endpointUrl');
      }
      final data = response.data;
      if (data == null) return const ByokNoMatch();
      final text = _extractText(data);
      if (text == null || text.isEmpty) return const ByokNoMatch();
      return _parseFoods(text);
    } on DioException catch (e) {
      // Network blip / DNS / TLS — surface as a generic failure
      // so the rung renders the calm "byok transport unavailable"
      // line (the key is preserved on disk; the user can retry).
      return ByokFailure(e.message ?? e.type.toString());
    } on Object catch (e) {
      return ByokFailure(e.toString());
    }
  }

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
  /// parse failure or an empty list.
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
      if (entry is! Map) continue;
      final name = entry['name'];
      final hint = entry['quantityHint'];
      if (name is! String || name.isEmpty) continue;
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
            unit: hint is String ? hint : 'serving',
            displayLabel: hint is String ? hint : '1 serving',
          ),
        ),
      );
    }
    if (foods.isEmpty) return const ByokNoMatch();
    return ByokRecognized(foods);
  }

  /// Parse the rate-limit reset timestamp from common header
  /// shapes. Returns `null` when the header is absent or unparsable
  /// (the rung renders the calm "quota exhausted — reset
  /// tomorrow" copy in that case).
  DateTime? _parseResetAt(Response<Map<String, dynamic>> response) {
    final headers = response.headers;
    final candidates = [
      headers.value('x-ratelimit-reset'),
      headers.value('retry-after'),
    ];
    for (final raw in candidates) {
      if (raw == null) continue;
      final asInt = int.tryParse(raw);
      if (asInt != null) {
        // OpenAI's `x-ratelimit-reset` is a unix timestamp (sec);
        // `retry-after` is a delta in seconds. The magnitude
        // tells them apart.
        if (asInt > 10_000_000) {
          return DateTime.fromMillisecondsSinceEpoch(asInt * 1000);
        }
        return DateTime.now().toUtc().add(Duration(seconds: asInt));
      }
    }
    return null;
  }

  /// Redacted `toString` (FR7 / NFR4). Never include the endpoint
  /// URL, the model id, or the key.
  @override
  String toString() => 'OpenAiCompatibleByokProvider(endpointUrl: redacted, '
      'model: redacted)';
}
