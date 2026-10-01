// `OffBarcodeSource` — Story 1.7 network seam for FR2 barcode lookups.
//
// Wraps `dio` against the public Open Food Facts read endpoint
// (`https://world.openfoodfacts.org/api/v2/product/{barcode}.json`).
// No API key is required (FR2 / OQ-3 v1): the endpoint is open and
// rate-limited by source IP, which is fine for the calm, single-scan
// cadence of the camera path.
//
// Typed result — `OffBarcodeResult` is a sealed hierarchy so the
// adapter can pattern-match on the three observable outcomes OFF
// produces:
//
//   * `OffBarcodeMatch`     — OFF resolved the product successfully.
//                             The adapter maps the JSON to a
//                             `DatabaseFood` (display name + the
//                             best-effort `FoodGroup` tag) and hands
//                             it back to the catalog port.
//   * `OffBarcodeNotFound`  — OFF returned 404 or `status === 0`.
//                             The adapter wraps this in
//                             `NotFoundFailure` so the UI can render
//                             the "type it manually" affordance.
//   * `OffBarcodeFailure`   — OFF 5xx, network error, malformed JSON,
//                             or any other unexpected path. The
//                             adapter wraps this in `CatalogFailure`
//                             so the UI renders the calm "Search
//                             isn't available right now" line.
//
// The source is intentionally minimal: no caching, no retries. Network
// hygiene (N3): connect 10 s / send 30 s / receive 45 s timeouts; the
// response is streamed and aborted past 2 MiB; only the fields the parser
// reads are requested (`fields=`); and, as OFF's API terms ask, every
// request carries a descriptive User-Agent (app, version, project URL — no
// personal contact). Browsers forbid setting `User-Agent`, so on web the
// header is simply omitted. Names and tags are capped (a product record is
// user-contributed, i.e. untrusted). The offline-first cache lives one layer up
// in `OfflineFirstFoodCatalog` so the catalog port owns the
// "previously-seen barcode → offline replay" contract (NFR5).
//
// The barcode string is the only thing sent off-device (FR13). No
// camera frames, no biometric signal, no device fingerprint.

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

import '../config/app_identity.dart';
import '../net/capped_response.dart';

/// The only product fields the parser reads (N3: do not download the whole
/// product record).
const String kOffFields =
    'product_name,product_name_en,generic_name,brands,categories_tags';

/// Longest product name kept (characters), and most / longest category tags.
const int kMaxOffNameLength = 100;
const int kMaxOffTags = 50;
const int kMaxOffTagLength = 100;

/// The product OFF returned for a barcode lookup. Refreshed against
/// the off>OFF v2 schema — the fields the adapter reads are
/// `status` (1 = found, 0 = not found), `product.product_name`,
/// `product.product_name_en`, `product.brands`, and
/// `product.categories_tags` (lowercased, hyphen-separated; e.g.
/// `en:spreads`, `en:sweet-spreads`).
class OffBarcodeMatch extends OffBarcodeResult {
  const OffBarcodeMatch({
    required this.barcode,
    required this.displayName,
    required this.categoryTags,
  });

  /// The verbatim barcode the adapter looked up. Useful for the
  /// `DatabaseFood.sourceRef` round-trip so the commit path can
  /// re-look-up or audit.
  final String barcode;

  /// Best-effort product name — OFF's `product_name` (or
  /// `product_name_en` fallback) with the brands stripped in front
  /// so the name reads cleanly on the match sheet.
  final String displayName;

  /// Lowercased, hyphenated category tags OFF attached to the
  /// product — the adapter uses these to pick a `FoodGroup` bucket
  /// for the balance arc. Empty list when OFF ships no tags.
  final List<String> categoryTags;
}

/// Typed "not found" outcome — OFF 404 OR `status === 0` with no
/// product. Distinct from a 5xx so the catalog can route the user
/// to the manual-add path instead of the calm failure line.
class OffBarcodeNotFound extends OffBarcodeResult {
  const OffBarcodeNotFound(this.barcode);

  final String barcode;
}

/// Typed transport / server failure — distinct from not-found so the
/// catalog surfaces the calm failure line for the user while the
/// adapter logs the raw cause.
class OffBarcodeFailure extends OffBarcodeResult {
  const OffBarcodeFailure(this.barcode, this.cause);

  final String barcode;
  final Object cause;
}

/// Sealed result of an OFF read.
sealed class OffBarcodeResult {
  const OffBarcodeResult();
}

/// Thin `dio` adapter for the OFF product read endpoint. Owns no
/// state — new instances per request are cheap (the `Dio` instance
/// can be shared at the call site if the test wants a single
/// `MockAdapter`).
class OffBarcodeSource {
  OffBarcodeSource({Dio? dio, String? baseUrl})
    : _dio = dio ?? createTimeoutDio(),
      _baseUrl = baseUrl ?? 'https://world.openfoodfacts.org';

  /// `dio` client. Tests inject a `Dio` with a `MockAdapter` so the
  /// network is never actually touched.
  final Dio _dio;

  /// Base URL — overridable for tests. Defaults to the public OFF
  /// host so a production build needs no configuration.
  final String _baseUrl;

  /// Read a single product by [barcode]. Returns the typed result
  /// for the three observable outcomes (match / not-found / failure).
  ///
  /// The barcode is trimmed before the request; whitespace is
  /// valid OFF behaviour (the API ignores it) but the test contract
  /// pins the trimmed form so callers can rely on it.
  Future<OffBarcodeResult> lookup(String barcode) async {
    final trimmed = barcode.trim();
    if (trimmed.isEmpty) {
      // Defensive: a blank barcode is a UI error, not an OFF call.
      return OffBarcodeNotFound(trimmed);
    }

    final Uri uri = Uri.parse(
      '$_baseUrl/api/v2/product/${Uri.encodeComponent(trimmed)}',
    ).replace(queryParameters: <String, String>{'fields': kOffFields});

    try {
      final cancel = CancelToken();
      final Response<ResponseBody> response = await _dio.getUri<ResponseBody>(
        uri,
        cancelToken: cancel,
        options: Options(
          responseType: ResponseType.stream,
          followRedirects: false,
          maxRedirects: 0,
          sendTimeout: kSendTimeout,
          receiveTimeout: kReceiveTimeout,
          headers: <String, String>{
            'Accept': 'application/json',
            if (!kIsWeb) 'User-Agent': kOpenPlateUserAgent,
          },
        ),
      );
      final status = response.statusCode ?? 0;
      final Object? body =
          status >= 200 && status < 300 && response.data != null
          ? await readCappedJson(response.data!, cancelToken: cancel)
          : null;
      return _parseResponse(trimmed, status, body);
    } on ResponseTooLargeException catch (e) {
      return OffBarcodeFailure(trimmed, e);
    } on DioException catch (e) {
      // 404 from OFF is delivered as a DioException with the
      // response attached; treat it as a typed not-found rather
      // than an opaque failure. Network-level errors (no
      // connection, DNS, timeout) flow through as `OffBarcodeFailure`.
      final code = e.response?.statusCode ?? 0;
      if (code == 404) {
        return OffBarcodeNotFound(trimmed);
      }
      return OffBarcodeFailure(trimmed, e);
    } on Object catch (e) {
      // Any other unexpected path — network down, malformed URI,
      // etc. — surfaces as a typed failure so the catalog can
      // route the user to the calm line.
      return OffBarcodeFailure(trimmed, e);
    }
  }

  /// Translate a successful `dio` response into the typed result.
  /// Pulled out of [lookup] so tests can exercise the parser
  /// directly without a network round-trip.
  OffBarcodeResult _parseResponse(
    String barcode,
    int statusCode,
    Object? body,
  ) {
    if (statusCode == 404) {
      return OffBarcodeNotFound(barcode);
    }
    if (statusCode < 200 || statusCode >= 300) {
      return OffBarcodeFailure(barcode, 'OFF HTTP $statusCode');
    }

    if (body is! Map<String, dynamic>) {
      return OffBarcodeFailure(barcode, 'OFF body is not a JSON object');
    }

    // OFF uses `status` (1 = found, 0 = not found) on the response
    // envelope. 0 with no product == not-found even when the HTTP
    // status was 200 — OFF's "ghost" 404.
    final dynamic rawStatus = body['status'];
    final dynamic product = body['product'];
    final bool offSaysFound = rawStatus == 1 || rawStatus == '1';
    if (!offSaysFound || product is! Map<String, dynamic>) {
      return OffBarcodeNotFound(barcode);
    }

    final name = _extractDisplayName(product);
    if (name.isEmpty) {
      // OFF sometimes returns a status_verbose=product_found body
      // with an empty product name (e.g. user-submitted photos
      // with no name yet). Treat that as not-found so the UI hands
      // off to manual entry rather than logging a blank slate.
      return OffBarcodeNotFound(barcode);
    }

    final tags = _extractCategoryTags(product);
    return OffBarcodeMatch(
      barcode: barcode,
      displayName: name,
      categoryTags: tags,
    );
  }

  /// Best-effort product name. Prefers `product_name` (the
  /// user-typed native string), falls back to `product_name_en`,
  /// then `generic_name`. Strips the leading brand when present so
  /// the name reads cleanly on the match sheet — the brand is
  /// implicitly the source of the barcode so the user knows what
  /// they scanned.
  String _extractDisplayName(Map<String, dynamic> product) {
    String? pick(String key) {
      final dynamic v = product[key];
      if (v is String) {
        final trimmed = v.trim();
        return trimmed.isEmpty ? null : trimmed;
      }
      return null;
    }

    final raw = _capText(
      pick('product_name') ??
          pick('product_name_en') ??
          pick('generic_name') ??
          '',
    );
    final brands = pick('brands');
    if (brands == null || brands.isEmpty) return raw;
    // Strip the leading brand if the name starts with it followed
    // by a separator. "Nutella - Ferrero" → "Nutella".
    final lower = raw.toLowerCase();
    final brandLower = brands.toLowerCase().split(',').first.trim();
    if (brandLower.isEmpty) return raw;
    if (lower.startsWith('$brandLower -')) {
      return raw.substring(brandLower.length + 3).trim();
    }
    if (lower.startsWith('$brandLower ')) {
      return raw.substring(brandLower.length + 1).trim();
    }
    return raw;
  }

  /// OFF's `categories_tags` is a list of hyphenated, lowercased
  /// tags prefixed with the language code (`en:spreads`). The
  /// adapter keeps the raw form so the FOOD GROUP mapper can pick
  /// the strongest match without re-parsing the JSON.
  List<String> _extractCategoryTags(Map<String, dynamic> product) {
    final dynamic raw = product['categories_tags'];
    if (raw is! List) return const <String>[];
    final out = <String>[];
    for (final entry in raw) {
      if (out.length >= kMaxOffTags) break;
      if (entry is String && entry.isNotEmpty) {
        out.add(_capText(entry.toLowerCase(), kMaxOffTagLength));
      }
    }
    return out;
  }

  /// Caps [text] at [max] characters (runes, so no split surrogate).
  static String _capText(String text, [int max = kMaxOffNameLength]) {
    final runes = text.runes;
    if (runes.length <= max) return text;
    return String.fromCharCodes(runes.take(max)).trim();
  }
}
