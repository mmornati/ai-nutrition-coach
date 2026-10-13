// Bounded response reading for every Dio client in this package (N3).
//
// A hostile or broken endpoint must not be able to make the app buffer an
// unbounded body. Requests are made with `ResponseType.stream`; this helper
// refuses an over-long `Content-Length` up front, then counts bytes as they
// arrive and aborts the moment the cap is crossed: it cancels its
// subscription AND the request's `CancelToken` (Dio does not always
// propagate a subscription cancel down to the socket; the token is what
// makes the HTTP adapter drop the connection).

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// Default ceiling for any response body: 2 MiB. A chat-completion with a
/// handful of foods, or one OFF product, is a few KiB.
const int kMaxResponseBytes = 2 * 1024 * 1024;

/// Connect / send / receive timeouts for the product's Dio clients.
const Duration kConnectTimeout = Duration(seconds: 10);
const Duration kSendTimeout = Duration(seconds: 30);
const Duration kReceiveTimeout = Duration(seconds: 45);

/// A `Dio` with the product timeouts. Used whenever a caller does not inject
/// its own (tests inject one backed by a fake adapter).
Dio createTimeoutDio({Map<String, Object?>? headers}) => Dio(
  BaseOptions(
    connectTimeout: kConnectTimeout,
    sendTimeout: kSendTimeout,
    receiveTimeout: kReceiveTimeout,
    // Never follow redirects (they would carry credentials / photos to a
    // host nobody consented to). A 3xx is treated as a failure.
    followRedirects: false,
    maxRedirects: 0,
    headers: headers,
  ),
);

/// Thrown by [readCappedBytes] when the body exceeds the cap.
class ResponseTooLargeException implements Exception {
  const ResponseTooLargeException(this.maxBytes);

  final int maxBytes;

  @override
  String toString() => 'response larger than $maxBytes bytes';
}

/// Overall wall-clock budget for reading one body. Dio's receive timeout is
/// per chunk, so a server dribbling one byte at a time would otherwise hold
/// the request open indefinitely.
const Duration kBodyReadTimeout = Duration(seconds: 60);

/// Reads [body] fully but never more than [maxBytes], and never for longer
/// than [timeout] overall. Throws [ResponseTooLargeException] (after
/// cancelling the stream) when the declared or actual size is over the cap,
/// and `TimeoutException` (also cancelling) when the budget runs out.
Future<Uint8List> readCappedBytes(
  ResponseBody body, {
  int maxBytes = kMaxResponseBytes,
  CancelToken? cancelToken,
  Duration timeout = kBodyReadTimeout,
}) async {
  final declared = int.tryParse(
    body.headers[Headers.contentLengthHeader]?.first ?? '',
  );
  if (declared != null && declared > maxBytes) {
    cancelToken?.cancel('response too large');
    throw ResponseTooLargeException(maxBytes);
  }
  final builder = BytesBuilder(copy: false);
  final done = Completer<Uint8List>();
  late final StreamSubscription<Uint8List> sub;
  sub = body.stream.listen(
    (chunk) {
      if (done.isCompleted) return;
      builder.add(chunk);
      if (builder.length > maxBytes) {
        done.completeError(ResponseTooLargeException(maxBytes));
        cancelToken?.cancel('response too large');
        unawaited(sub.cancel());
      }
    },
    onError: (Object e, StackTrace s) {
      if (!done.isCompleted) done.completeError(e, s);
    },
    onDone: () {
      if (!done.isCompleted) done.complete(builder.takeBytes());
    },
    cancelOnError: true,
  );
  return done.future.timeout(
    timeout,
    onTimeout: () {
      cancelToken?.cancel('response read timed out');
      unawaited(sub.cancel());
      throw TimeoutException('response read timed out', timeout);
    },
  );
}

/// [readCappedBytes] then UTF-8 + JSON decode. Throws on a too-large body;
/// returns `null` when the body is not valid JSON.
Future<Object?> readCappedJson(
  ResponseBody body, {
  int maxBytes = kMaxResponseBytes,
  CancelToken? cancelToken,
  Duration timeout = kBodyReadTimeout,
}) async {
  final bytes = await readCappedBytes(
    body,
    maxBytes: maxBytes,
    cancelToken: cancelToken,
    timeout: timeout,
  );
  try {
    return jsonDecode(utf8.decode(bytes));
  } on FormatException {
    return null;
  }
}
