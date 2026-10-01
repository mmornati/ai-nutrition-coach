// A scriptable Dio `HttpClientAdapter`: records every request and replies
// with a canned status / body / headers, a chunked (possibly endless) body,
// or a transport error.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

class FakeHttpAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  final List<String> requestBodies = [];

  int status = 200;
  Map<String, List<String>> headers = {
    'content-type': ['application/json'],
  };
  Object? jsonBody;

  /// When set, replaces the JSON body with these raw chunks.
  Stream<Uint8List>? chunks;
  int chunksCancelled = 0;
  int chunksEmitted = 0;

  /// When set, `fetch` throws it (a connection error / timeout).
  DioException? error;

  RequestOptions get last => requests.last;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    requestBodies.add(
      options.data is String
          ? options.data as String
          : jsonEncode(options.data),
    );
    final err = error;
    if (err != null) {
      throw DioException(
        requestOptions: options,
        type: err.type,
        message: err.message,
      );
    }
    if (chunks != null) {
      late final StreamSubscription<Uint8List> inner;
      final controller = StreamController<Uint8List>(
        onCancel: () => inner.cancel(),
      );
      // A real adapter aborts the socket when Dio's cancel future fires.
      unawaited(
        cancelFuture?.then((_) {
          chunksCancelled++;
          return inner.cancel();
        }),
      );
      inner = chunks!.listen((c) {
        chunksEmitted++;
        controller.add(c);
      }, onDone: controller.close);
      return ResponseBody(controller.stream, status, headers: headers);
    }
    final encoded = jsonBody is String
        ? jsonBody! as String
        : jsonEncode(jsonBody);
    return ResponseBody.fromString(encoded, status, headers: headers);
  }
}

/// A JSON chat-completions reply wrapping [text] as the assistant message.
Map<String, Object?> chatReply(String text) => {
  'choices': [
    {
      'message': {'role': 'assistant', 'content': text},
    },
  ],
};

/// A minimal JPEG: SOI, an APP1 "Exif" segment carrying a GPS-looking
/// payload, a DQT, SOS, entropy data, EOI.
Uint8List jpegWithExif() => Uint8List.fromList([
  0xFF, 0xD8,
  // APP0 JFIF
  0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
  0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  // APP1 Exif: length 0x0014 (20 bytes incl. length) -> 18 payload bytes
  0xFF, 0xE1, 0x00, 0x14,
  ...'Exif\u0000\u0000GPS:48.8584N'.codeUnits.take(18),
  // COM
  0xFF, 0xFE, 0x00, 0x06, 0x68, 0x69, 0x21, 0x21,
  // DQT
  0xFF, 0xDB, 0x00, 0x04, 0x00, 0x01,
  // SOS + data + EOI
  0xFF, 0xDA, 0x00, 0x04, 0x00, 0x00, 0x12, 0x34, 0xFF, 0x00, 0x56,
  0xFF, 0xD9,
]);
