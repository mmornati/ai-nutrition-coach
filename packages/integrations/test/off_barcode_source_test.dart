// `OffBarcodeSource` network hygiene (N3): User-Agent, `fields=`, timeouts,
// response-size cap, capped parsed text.

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

import '_support/fake_http_adapter.dart';

OffBarcodeSource _source(FakeHttpAdapter a) =>
    OffBarcodeSource(dio: Dio()..httpClientAdapter = a);

void main() {
  test('sends a descriptive User-Agent (app/version/project URL, no email) '
      'and only the fields the parser reads', () async {
    final a = FakeHttpAdapter()
      ..jsonBody = {
        'status': 1,
        'product': {'product_name': 'Nutella', 'categories_tags': <String>[]},
      };
    final r = await _source(a).lookup('3017620422003');
    expect(r, isA<OffBarcodeMatch>());

    final ua = a.last.headers['User-Agent']! as String;
    expect(ua, startsWith('AiNutritionCoach/'));
    expect(ua, contains(kAiNutritionCoachVersion));
    expect(ua, contains(kAiNutritionCoachProjectUrl));
    expect(ua, isNot(contains('@')), reason: 'no personal email');

    expect(a.last.uri.queryParameters['fields'], kOffFields);
    expect(kOffFields, contains('product_name'));
    expect(kOffFields, contains('categories_tags'));
    expect(a.last.uri.path, '/api/v2/product/3017620422003');
  });

  test('privacy: the request is exactly GET /api/v2/product/<barcode>?fields= '
      'with an Accept and the User-Agent, nothing else', () async {
    final a = FakeHttpAdapter()..jsonBody = {'status': 0};
    await _source(a).lookup(' 3017620422003 ');
    final r = a.last;

    expect(r.method, 'GET');
    expect(r.uri.scheme, 'https');
    expect(r.uri.host, 'world.openfoodfacts.org');
    expect(r.uri.hasPort, isFalse);
    expect(r.uri.path, '/api/v2/product/3017620422003');
    expect(r.uri.queryParameters.keys.toSet(), {'fields'});
    expect(r.uri.queryParameters['fields'], kOffFields);
    expect(r.uri.hasFragment, isFalse);
    expect(r.uri.userInfo, isEmpty);
    expect(a.requestBodies.single, anyOf('null', ''), reason: 'no body');

    final names = r.headers.keys.map((h) => h.toLowerCase()).toSet();
    expect(
      names.difference({'accept', 'user-agent'}),
      isEmpty,
      reason: 'only Accept and User-Agent may be sent (got $names)',
    );
    for (final forbidden in [
      'referer',
      'cookie',
      'authorization',
      'origin',
      'x-forwarded-for',
    ]) {
      expect(names, isNot(contains(forbidden)));
    }
    expect(r.headers['Accept'], 'application/json');
    expect(r.headers['User-Agent'], kAiNutritionCoachUserAgent);
    expect(kOffFields.split(','), isNot(contains('code')));
    expect(r.followRedirects, isFalse);
  });

  test('timeouts: 10 / 30 / 45 seconds', () async {
    final a = FakeHttpAdapter()..jsonBody = {'status': 0};
    await _source(a).lookup('1');
    expect(a.last.sendTimeout, const Duration(seconds: 30));
    expect(a.last.receiveTimeout, const Duration(seconds: 45));
    expect(
      OffBarcodeSource().toString(),
      isNotEmpty,
      reason: 'default construction (with createTimeoutDio) works',
    );
  });

  test('a response past 2 MiB is aborted -> OffBarcodeFailure', () async {
    final a = FakeHttpAdapter()
      ..chunks = Stream<Uint8List>.periodic(
        Duration.zero,
        (_) => Uint8List(256 * 1024),
      );
    final r = await _source(a).lookup('1');
    expect(r, isA<OffBarcodeFailure>());
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final emitted = a.chunksEmitted;
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(a.chunksCancelled, 1, reason: 'the request was cancelled');
    expect(a.chunksEmitted, emitted, reason: 'the stream stopped being read');
    expect(a.chunksEmitted, lessThan(40), reason: 'aborted near the cap');
  });

  test('name and tags are capped (OFF data is user-contributed)', () async {
    final a = FakeHttpAdapter()
      ..jsonBody = {
        'status': 1,
        'product': {
          'product_name': 'N' * 400,
          'categories_tags': [for (var i = 0; i < 200; i++) 'en:tag-$i'],
        },
      };
    final r = await _source(a).lookup('1') as OffBarcodeMatch;
    expect(r.displayName.length, 100);
    expect(r.categoryTags.length, kMaxOffTags);
  });

  test(
    '404 is not-found, 503 is failure (stream mode keeps the mapping)',
    () async {
      final nf = FakeHttpAdapter()
        ..status = 404
        ..jsonBody = {'status': 0};
      expect(await _source(nf).lookup('1'), isA<OffBarcodeNotFound>());
      final err = FakeHttpAdapter()
        ..status = 503
        ..jsonBody = {};
      expect(await _source(err).lookup('1'), isA<OffBarcodeFailure>());
    },
  );

  test('redirects are not followed; a 302 is a failure', () async {
    final a = FakeHttpAdapter()
      ..status = 302
      ..headers = {
        'location': ['https://evil.example.net/'],
      }
      ..jsonBody = {};
    final r = await _source(a).lookup('1');
    expect(r, isA<OffBarcodeFailure>());
    expect(a.requests, hasLength(1));
    expect(a.last.followRedirects, isFalse);
    expect(a.last.maxRedirects, 0);
  });
}
