// N7 — endpoint validation and URL joining.

import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

ByokEndpointValid _ok(String raw) {
  final v = validateByokEndpoint(raw);
  expect(v, isA<ByokEndpointValid>(), reason: raw);
  return v as ByokEndpointValid;
}

ByokEndpointProblem _bad(String raw) {
  final v = validateByokEndpoint(raw);
  expect(v, isA<ByokEndpointInvalid>(), reason: raw);
  return (v as ByokEndpointInvalid).problem;
}

void main() {
  group('validateByokEndpoint', () {
    test('https is accepted; host is exposed for the consent dialog', () {
      final v = _ok('https://openrouter.ai/api/v1');
      expect(v.host, 'openrouter.ai');
      expect(v.isLocal, isFalse);
    });

    test('plain http is refused for any non-loopback host', () {
      expect(_bad('http://example.com/v1'), ByokEndpointProblem.notHttps);
      expect(
        _bad('http://192.168.1.20:11434/v1'),
        ByokEndpointProblem.notHttps,
      );
      expect(
        _bad('http://localhost.evil.com/v1'),
        ByokEndpointProblem.notHttps,
      );
    });

    test('http is allowed ONLY for localhost, 127.0.0.1 and ::1', () {
      expect(_ok('http://localhost:11434/v1').isLocal, isTrue);
      expect(_ok('http://127.0.0.1:8080').isLocal, isTrue);
      expect(_ok('http://[::1]:1234/v1').isLocal, isTrue);
      expect(_ok('http://LOCALHOST/v1').isLocal, isTrue);
    });

    test('not a URL at all', () {
      expect(_bad('   '), ByokEndpointProblem.empty);
      expect(_bad(''), ByokEndpointProblem.empty);
      expect(_bad('openrouter.ai/api'), ByokEndpointProblem.notAUrl);
      expect(_bad('javascript:alert(1)'), ByokEndpointProblem.notAUrl);
      expect(_bad('file:///etc/passwd'), ByokEndpointProblem.notAUrl);
      expect(_bad('ftp://example.com'), ByokEndpointProblem.notAUrl);
      expect(_bad('https://'), ByokEndpointProblem.notAUrl);
    });

    test('credentials, query and fragment are refused', () {
      expect(
        _bad('https://user:pw@example.com/v1'),
        ByokEndpointProblem.hasCredentials,
      );
      expect(
        _bad('https://example.com/v1?key=abc'),
        ByokEndpointProblem.hasQueryOrFragment,
      );
      expect(
        _bad('https://example.com/v1#frag'),
        ByokEndpointProblem.hasQueryOrFragment,
      );
    });

    test('surrounding whitespace is tolerated', () {
      expect(_ok('  https://example.com/v1  ').host, 'example.com');
    });
  });

  group('chatCompletions join', () {
    test('trailing slash or not, the same URL', () {
      expect(
        _ok('https://api.example.com/v1').chatCompletions.toString(),
        'https://api.example.com/v1/chat/completions',
      );
      expect(
        _ok('https://api.example.com/v1/').chatCompletions.toString(),
        'https://api.example.com/v1/chat/completions',
      );
    });

    test('bare host and a port', () {
      expect(
        _ok('https://api.example.com').chatCompletions.toString(),
        'https://api.example.com/chat/completions',
      );
      expect(
        _ok('http://localhost:11434/v1//').chatCompletions.path,
        isNot(contains('//chat')),
        reason: 'no doubled slash before the resource',
      );
    });
  });
}
