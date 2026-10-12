// `OpenAiCompatibleByokProvider` — transport hygiene (N1, N3, N7, N8) and
// the Your AI "Test connection" call.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

import '_support/fake_http_adapter.dart';

const _key = 'sk-or-v1-supersecretkey1234567890abcd';

OpenAiCompatibleByokProvider _provider(
  FakeHttpAdapter adapter, {
  String endpoint = 'https://api.example.com/v1',
  String model = 'vision-1',
}) {
  final dio = Dio()..httpClientAdapter = adapter;
  return OpenAiCompatibleByokProvider(
    endpointUrl: endpoint,
    model: model,
    dio: dio,
  );
}

void main() {
  group('what leaves the device (privacy audit, automated check 1)', () {
    // Pins the EXACT shape of the request: a new field (a date, an id, the
    // locale, a user name, ...) fails this test and has to be argued in the
    // diff and in docs/ai-tiers.md.
    Map<String, Object?> sentBody(FakeHttpAdapter a) =>
        jsonDecode(a.requestBodies.single) as Map<String, Object?>;

    test(
      'the photo request has exactly these keys, parts and headers',
      () async {
        final a = FakeHttpAdapter()..jsonBody = chatReply('[]');
        await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key);
        final body = sentBody(a);

        expect(body.keys.toSet(), {
          'model',
          'messages',
          'max_tokens',
          'temperature',
        });
        expect(body['model'], 'vision-1');
        expect(body['max_tokens'], 800);
        expect(body['temperature'], 0.2);

        final messages = body['messages']! as List;
        expect(messages, hasLength(1));
        final message = messages.single as Map<String, Object?>;
        expect(message.keys.toSet(), {'role', 'content'});
        expect(message['role'], 'user');

        final parts = (message['content']! as List)
            .cast<Map<String, Object?>>();
        expect(parts, hasLength(2));
        expect(parts[0].keys.toSet(), {'type', 'text'});
        expect(parts[0]['type'], 'text');
        expect(parts[0]['text'], OpenAiCompatibleByokProvider.prompt);
        expect(parts[1].keys.toSet(), {'type', 'image_url'});
        expect(parts[1]['type'], 'image_url');
        final image = parts[1]['image_url']! as Map<String, Object?>;
        expect(image.keys.toSet(), {'url'});
        expect(image['url'], startsWith('data:image/jpeg;base64,'));

        final headerNames = a.last.headers.keys.map((h) => h.toLowerCase());
        expect(
          headerNames.toSet().difference({
            'authorization',
            'content-type',
            'content-length',
            'user-agent',
          }),
          isEmpty,
          reason: 'no Referer, Cookie, X-* or identifier header may be added',
        );
        expect(a.last.headers['Authorization'], 'Bearer $_key');
        expect(a.last.queryParameters, isEmpty);
        expect(a.last.uri.hasQuery, isFalse);
      },
    );

    test('nothing but the fixed prompt, the model and the photo is in the '
        'body: no date, id, locale or name', () async {
      final a = FakeHttpAdapter()..jsonBody = chatReply('[]');
      await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key);
      final body = sentBody(a);
      // Everything except the base64 photo.
      final parts =
          (((body['messages']! as List).single as Map)['content'] as List)
              .cast<Map<String, Object?>>();
      final scannable = jsonEncode({
        ...body,
        'messages': [
          {
            'role': 'user',
            'content': [parts[0]],
          },
        ],
      });
      expect(
        scannable,
        isNot(matches(RegExp(r'\d{4}-\d{2}-\d{2}'))),
        reason: 'no ISO date',
      );
      expect(scannable, isNot(matches(RegExp(r'\b[a-z]{2}[-_][A-Z]{2}\b'))));
      for (final needle in ['plate', 'Plate', 'locale', 'user_id', 'device']) {
        // The prompt says "plate" once, about the photo; nothing else may.
        final count = needle.allMatches(scannable).length;
        expect(
          count,
          lessThanOrEqualTo(needle == 'plate' ? 2 : 0),
          reason: needle,
        );
      }
      expect(
        OpenAiCompatibleByokProvider.prompt,
        isNot(matches(RegExp(r'\d{4}-\d{2}-\d{2}'))),
      );
    });

    test('the connection test sends only a one-token ping', () async {
      final a = FakeHttpAdapter()..jsonBody = chatReply('pong');
      await _provider(a).testConnection(apiKey: _key);
      final body = sentBody(a);
      expect(body.keys.toSet(), {
        'model',
        'messages',
        'max_tokens',
        'temperature',
      });
      expect(body['messages'], [
        {'role': 'user', 'content': 'ping'},
      ]);
      expect(body['max_tokens'], 1);
      final headerNames = a.last.headers.keys.map((h) => h.toLowerCase());
      expect(
        headerNames.toSet().difference({
          'authorization',
          'content-type',
          'content-length',
          'user-agent',
        }),
        isEmpty,
      );
    });
  });

  group('recognize', () {
    test('posts to <base>/chat/completions with the key ONLY in the '
        'Authorization header', () async {
      final a = FakeHttpAdapter()
        ..jsonBody = chatReply('[{"name":"Apple","quantityHint":"1 piece"}]');
      final out = await _provider(
        a,
        endpoint: 'https://api.example.com/v1/',
      ).recognize(photoBytes: jpegWithExif(), apiKey: _key);

      expect(out, isA<ByokRecognized>());
      expect(
        a.last.uri.toString(),
        'https://api.example.com/v1/chat/completions',
      );
      expect(a.last.headers['Authorization'], 'Bearer $_key');
      expect(a.last.uri.toString(), isNot(contains('sk-')));
      expect(a.requestBodies.single, isNot(contains('sk-or')));
    });

    test('N1: the data URL carries the REAL mime and NO metadata', () async {
      final a = FakeHttpAdapter()..jsonBody = chatReply('[]');
      await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key);
      final body = jsonDecode(a.requestBodies.single) as Map<String, Object?>;
      final url =
          (((body['messages']! as List).single as Map)['content'] as List)
                  .whereType<Map<String, Object?>>()
                  .firstWhere((p) => p['type'] == 'image_url')['image_url']
              as Map;
      final dataUrl = url['url']! as String;
      expect(dataUrl, startsWith('data:image/jpeg;base64,'));
      final sent = base64Decode(dataUrl.split(',').last);
      expect(String.fromCharCodes(sent), isNot(contains('GPS')));
      expect(String.fromCharCodes(sent), isNot(contains('Exif')));
    });

    test('N1: a PNG is labelled image/png, not image/jpeg', () async {
      final a = FakeHttpAdapter()..jsonBody = chatReply('[]');
      final png = Uint8List.fromList([
        0x89,
        0x50,
        0x4E,
        0x47,
        0x0D,
        0x0A,
        0x1A,
        0x0A,
        0,
        0,
        0,
        0,
        ...'IEND'.codeUnits,
        0,
        0,
        0,
        0,
      ]);
      await _provider(a).recognize(photoBytes: png, apiKey: _key);
      expect(a.requestBodies.single, contains('data:image/png;base64,'));
    });

    test('N1: bytes that are not a sendable image are refused BEFORE any '
        'request', () async {
      final a = FakeHttpAdapter();
      final out = await _provider(
        a,
      ).recognize(photoBytes: Uint8List.fromList([1, 2, 3]), apiKey: _key);
      expect(out, isA<ByokFailure>());
      expect(a.requests, isEmpty);
    });

    test('N7: an invalid endpoint makes no request', () async {
      for (final bad in [
        'http://example.com/v1',
        'ftp://x',
        'not a url',
        'https://u:p@x.com',
      ]) {
        final a = FakeHttpAdapter();
        final out = await _provider(
          a,
          endpoint: bad,
        ).recognize(photoBytes: jpegWithExif(), apiKey: _key);
        expect(out, isA<ByokFailure>(), reason: bad);
        expect(a.requests, isEmpty, reason: bad);
      }
    });

    test('N7: http://localhost is allowed (a local model)', () async {
      final a = FakeHttpAdapter()..jsonBody = chatReply('[]');
      await _provider(
        a,
        endpoint: 'http://localhost:11434/v1',
      ).recognize(photoBytes: jpegWithExif(), apiKey: _key);
      expect(a.requests, hasLength(1));
    });

    test('unset endpoint / model: no request', () async {
      final a = FakeHttpAdapter();
      expect(
        await _provider(
          a,
          endpoint: '',
        ).recognize(photoBytes: jpegWithExif(), apiKey: _key),
        isA<ByokFailure>(),
      );
      expect(
        await _provider(
          a,
          model: '',
        ).recognize(photoBytes: jpegWithExif(), apiKey: _key),
        isA<ByokFailure>(),
      );
      expect(a.requests, isEmpty);
    });

    test('401 / 403 -> key rejected', () async {
      for (final code in [401, 403]) {
        final a = FakeHttpAdapter()
          ..status = code
          ..jsonBody = {'error': 'no'};
        expect(
          await _provider(
            a,
          ).recognize(photoBytes: jpegWithExif(), apiKey: _key),
          isA<ByokKeyRejected>(),
        );
      }
    });

    test('N8: 429 reads retry-after as seconds and x-ratelimit-reset as a '
        'duration string', () async {
      final before = DateTime.now().toUtc();
      final a = FakeHttpAdapter()
        ..status = 429
        ..headers = {
          'retry-after': ['90'],
        }
        ..jsonBody = {};
      final out =
          await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key)
              as ByokQuotaExhausted;
      expect(
        out.resetAt!.difference(before).inSeconds,
        inInclusiveRange(89, 95),
      );

      final b = FakeHttpAdapter()
        ..status = 429
        ..headers = {
          'x-ratelimit-reset': ['6m0s'],
        }
        ..jsonBody = {};
      final out2 =
          await _provider(b).recognize(photoBytes: jpegWithExif(), apiKey: _key)
              as ByokQuotaExhausted;
      expect(
        out2.resetAt!.difference(before).inSeconds,
        inInclusiveRange(359, 365),
      );
    });

    test('5xx -> failure naming the host only', () async {
      final a = FakeHttpAdapter()
        ..status = 503
        ..jsonBody = {};
      final out =
          await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key)
              as ByokFailure;
      expect(out.cause.toString(), contains('503'));
      expect(out.cause.toString(), contains('api.example.com'));
      expect(out.cause.toString(), isNot(contains('sk-')));
    });

    test('N3: a timeout is a calm failure, key-free', () async {
      final a = FakeHttpAdapter()
        ..error = DioException(
          requestOptions: RequestOptions(),
          type: DioExceptionType.receiveTimeout,
        );
      final out =
          await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key)
              as ByokFailure;
      expect(out.cause.toString(), contains('timed out'));
      expect(out.cause.toString(), isNot(contains(_key)));
    });

    test('N3: send/receive timeouts are set on the request; the default '
        'client has connect 10s / send 30s / receive 45s', () async {
      final a = FakeHttpAdapter()..jsonBody = chatReply('[]');
      await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key);
      expect(a.last.sendTimeout, const Duration(seconds: 30));
      expect(a.last.receiveTimeout, const Duration(seconds: 45));

      final dio = createTimeoutDio();
      expect(dio.options.connectTimeout, const Duration(seconds: 10));
      expect(dio.options.sendTimeout, const Duration(seconds: 30));
      expect(dio.options.receiveTimeout, const Duration(seconds: 45));
    });

    test('N3: a response past 2 MiB is aborted (stream cancelled), '
        'not buffered', () async {
      final a = FakeHttpAdapter()
        ..chunks = Stream<Uint8List>.periodic(
          Duration.zero,
          (_) => Uint8List(256 * 1024),
        );
      final out =
          await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key)
              as ByokFailure;
      expect(out.cause.toString(), contains('too large'));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final emitted = a.chunksEmitted;
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(a.chunksCancelled, 1, reason: 'the request was cancelled');
      expect(a.chunksEmitted, emitted, reason: 'the stream stopped being read');
      expect(a.chunksEmitted, lessThan(40), reason: 'aborted near the cap');
    });

    test('N3: an over-long Content-Length is refused up front', () async {
      final a = FakeHttpAdapter()
        ..headers = {
          'content-type': ['application/json'],
          'content-length': ['${3 * 1024 * 1024}'],
        }
        ..jsonBody = chatReply('[]');
      expect(
        await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key),
        isA<ByokFailure>(),
      );
    });

    test('N3: at most 20 foods, names and hints at most 100 characters, '
        'control characters removed', () async {
      final foods = [
        for (var i = 0; i < 40; i++)
          {'name': 'Food $i', 'quantityHint': 'x' * 300},
        {'name': 'Bad\u0000\nName', 'quantityHint': 'ok'},
      ];
      final long = [
        {'name': 'N' * 500, 'quantityHint': 'h'},
        ...foods,
      ];
      final a = FakeHttpAdapter()..jsonBody = chatReply(jsonEncode(long));
      final out =
          await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key)
              as ByokRecognized;
      expect(out.foods, hasLength(20));
      expect(out.foods.first.databaseFood.displayName.length, 100);
      for (final f in out.foods) {
        expect(f.databaseFood.displayName.length, lessThanOrEqualTo(100));
        expect(f.quantity.displayLabel.length, lessThanOrEqualTo(100));
      }
      final control = jsonEncode([
        {'name': 'Bad\u0000\nName', 'quantityHint': 'a\tb'},
      ]);
      final b = FakeHttpAdapter()..jsonBody = chatReply(control);
      final out2 =
          await _provider(b).recognize(photoBytes: jpegWithExif(), apiKey: _key)
              as ByokRecognized;
      expect(out2.foods.single.databaseFood.displayName, 'Bad Name');
      expect(out2.foods.single.quantity.displayLabel, 'a b');
    });

    test('3xx redirects are never followed and are a failure (the key and '
        'photo must not follow a Location header)', () async {
      final a = FakeHttpAdapter()
        ..status = 302
        ..headers = {
          'location': ['https://evil.example.net/steal'],
        }
        ..jsonBody = {};
      final out =
          await _provider(a).recognize(photoBytes: jpegWithExif(), apiKey: _key)
              as ByokFailure;
      expect(out.cause.toString(), contains('302'));
      expect(a.requests, hasLength(1));
      expect(a.last.followRedirects, isFalse);
      expect(a.last.maxRedirects, 0);
      final dio = createTimeoutDio();
      expect(dio.options.followRedirects, isFalse);
      expect(dio.options.maxRedirects, 0);
    });

    test(
      'a body that dribbles past the overall read budget is aborted',
      () async {
        final a = FakeHttpAdapter()
          ..chunks = Stream<Uint8List>.periodic(
            const Duration(milliseconds: 5),
            (_) => Uint8List(1),
          );
        final dio = Dio()..httpClientAdapter = a;
        final r = await dio.getUri<ResponseBody>(
          Uri.parse('https://x.example.com/'),
          options: Options(responseType: ResponseType.stream),
        );
        await expectLater(
          readCappedBytes(r.data!, timeout: const Duration(milliseconds: 60)),
          throwsA(isA<TimeoutException>()),
        );
      },
    );

    test('toString is redacted', () {
      final p = OpenAiCompatibleByokProvider(
        endpointUrl: 'https://private.example.com/v1',
        model: 'secret-model',
      );
      expect(p.toString(), isNot(contains('private')));
      expect(p.toString(), isNot(contains('secret-model')));
    });
  });

  group('testConnection', () {
    test('ok: one-token chat completion with the key in the header', () async {
      final a = FakeHttpAdapter()..jsonBody = chatReply('pong');
      final r = await _provider(a).testConnection(apiKey: _key);
      expect(r, isA<ByokConnectionOk>());
      final body = jsonDecode(a.requestBodies.single) as Map<String, Object?>;
      expect(body['max_tokens'], 1);
      expect(a.last.headers['Authorization'], 'Bearer $_key');
      expect(a.last.receiveTimeout, const Duration(seconds: 20));
    });

    test(
      'too-large reply -> a dedicated result; 302 -> unexpected status',
      () async {
        final big = FakeHttpAdapter()
          ..chunks = Stream<Uint8List>.periodic(
            Duration.zero,
            (_) => Uint8List(256 * 1024),
          );
        expect(
          await _provider(big).testConnection(apiKey: _key),
          isA<ByokConnectionResponseTooLarge>(),
        );
        final redirect = FakeHttpAdapter()
          ..status = 302
          ..jsonBody = {};
        expect(
          await _provider(redirect).testConnection(apiKey: _key),
          isA<ByokConnectionUnexpectedStatus>().having(
            (r) => r.statusCode,
            'status',
            302,
          ),
        );
      },
    );

    test('maps 401, 429, 404, timeout, network, invalid endpoint, and '
        'unconfigured', () async {
      Future<ByokConnectionResult> run(
        void Function(FakeHttpAdapter) setup, {
        String endpoint = 'https://api.example.com/v1',
        String model = 'm',
        String key = _key,
      }) {
        final a = FakeHttpAdapter()..jsonBody = {};
        setup(a);
        return _provider(
          a,
          endpoint: endpoint,
          model: model,
        ).testConnection(apiKey: key);
      }

      expect(
        await run((a) => a.status = 401),
        isA<ByokConnectionKeyRejected>(),
      );
      expect(
        await run(
          (a) => a
            ..status = 429
            ..headers = {
              'retry-after': ['5'],
            },
        ),
        isA<ByokConnectionRateLimited>().having(
          (r) => r.resetAt,
          'resetAt',
          isNotNull,
        ),
      );
      expect(
        await run((a) => a.status = 404),
        isA<ByokConnectionUnexpectedStatus>().having(
          (r) => r.statusCode,
          'status',
          404,
        ),
      );
      expect(
        await run(
          (a) => a.error = DioException(
            requestOptions: RequestOptions(),
            type: DioExceptionType.connectionTimeout,
          ),
        ),
        isA<ByokConnectionUnreachable>().having(
          (r) => r.reason,
          'reason',
          ByokUnreachableReason.timeout,
        ),
      );
      expect(
        await run(
          (a) => a.error = DioException(
            requestOptions: RequestOptions(),
            type: DioExceptionType.connectionError,
          ),
        ),
        isA<ByokConnectionUnreachable>().having(
          (r) => r.reason,
          'reason',
          ByokUnreachableReason.network,
        ),
      );
      expect(
        await run((_) {}, endpoint: 'http://example.com'),
        isA<ByokConnectionEndpointInvalid>().having(
          (r) => r.problem,
          'problem',
          ByokEndpointProblem.notHttps,
        ),
      );
      expect(
        await run((_) {}, endpoint: ''),
        isA<ByokConnectionNotConfigured>(),
      );
      expect(
        await run((_) {}, model: '  '),
        isA<ByokConnectionNotConfigured>(),
      );
      expect(await run((_) {}, key: ''), isA<ByokConnectionNotConfigured>());
    });
  });
}
