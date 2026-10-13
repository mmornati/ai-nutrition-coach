// N1 — what leaves the device: real MIME type, metadata removed, refuse
// when that cannot be guaranteed.

import 'dart:typed_data';

import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

import '_support/fake_http_adapter.dart' show jpegWithExif;

bool _contains(Uint8List hay, List<int> needle) {
  for (var i = 0; i + needle.length <= hay.length; i++) {
    var ok = true;
    for (var j = 0; j < needle.length; j++) {
      if (hay[i + j] != needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

Uint8List _png({bool withMetadata = true}) {
  List<int> chunk(String type, List<int> data) => [
    (data.length >> 24) & 0xFF,
    (data.length >> 16) & 0xFF,
    (data.length >> 8) & 0xFF,
    data.length & 0xFF,
    ...type.codeUnits,
    ...data,
    0, 0, 0, 0, // CRC (not validated by the stripper)
  ];
  return Uint8List.fromList([
    0x89,
    0x50,
    0x4E,
    0x47,
    0x0D,
    0x0A,
    0x1A,
    0x0A,
    ...chunk('IHDR', List.filled(13, 1)),
    if (withMetadata) ...chunk('eXIf', 'GPS-SECRET'.codeUnits),
    if (withMetadata) ...chunk('tEXt', 'Comment\u0000secret'.codeUnits),
    ...chunk('IDAT', [1, 2, 3, 4]),
    ...chunk('IEND', []),
  ]);
}

Uint8List _webp({bool withExif = true}) {
  List<int> le(int n) => [
    n & 0xFF,
    (n >> 8) & 0xFF,
    (n >> 16) & 0xFF,
    (n >> 24) & 0xFF,
  ];
  List<int> chunk(String type, List<int> data) => [
    ...type.codeUnits,
    ...le(data.length),
    ...data,
    if (data.length.isOdd) 0,
  ];
  final vp8x = chunk('VP8X', [
    withExif ? 0x08 : 0x00,
    0,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
  ]);
  final body = [
    ...'WEBP'.codeUnits,
    ...vp8x,
    ...chunk('VP8 ', [9, 9, 9, 9]),
    if (withExif) ...chunk('EXIF', 'GPS-SECRET'.codeUnits),
  ];
  return Uint8List.fromList([...'RIFF'.codeUnits, ...le(body.length), ...body]);
}

void main() {
  group('detectPhotoFormat', () {
    test('JPEG / PNG / WebP / HEIC by magic bytes', () {
      expect(detectPhotoFormat(jpegWithExif()), PhotoFormat.jpeg);
      expect(detectPhotoFormat(_png()), PhotoFormat.png);
      expect(detectPhotoFormat(_webp()), PhotoFormat.webp);
      final heic = Uint8List.fromList([
        0,
        0,
        0,
        0x18,
        ...'ftypheic'.codeUnits,
        0,
        0,
        0,
        0,
        ...'mif1heic'.codeUnits,
      ]);
      expect(detectPhotoFormat(heic), PhotoFormat.heic);
      expect(PhotoFormat.heic.mime, 'image/heic');
    });

    test('unknown / empty / too short -> null', () {
      expect(detectPhotoFormat(Uint8List(0)), isNull);
      expect(detectPhotoFormat(Uint8List.fromList([1, 2, 3, 4])), isNull);
      expect(detectPhotoFormat(Uint8List.fromList([0xFF, 0xD8])), isNull);
      // ftyp with a non-image brand (an MP4)
      final mp4 = Uint8List.fromList([
        0,
        0,
        0,
        0x18,
        ...'ftypisom'.codeUnits,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ]);
      expect(detectPhotoFormat(mp4), isNull);
    });
  });

  group('sanitizePhotoForUpload', () {
    test('JPEG: EXIF/GPS, XMP-class and COM segments are gone; pixels and '
        'JFIF stay; MIME is image/jpeg', () {
      final input = jpegWithExif();
      expect(_contains(input, 'GPS'.codeUnits), isTrue, reason: 'fixture');

      final r = sanitizePhotoForUpload(input);
      expect(r, isA<SanitizedPhoto>());
      final out = r as SanitizedPhoto;
      expect(out.mime, 'image/jpeg');
      expect(_contains(out.bytes, 'GPS'.codeUnits), isFalse);
      expect(_contains(out.bytes, 'Exif'.codeUnits), isFalse);
      expect(_contains(out.bytes, [0xFF, 0xE1]), isFalse, reason: 'no APP1');
      expect(_contains(out.bytes, [0xFF, 0xFE]), isFalse, reason: 'no COM');
      expect(_contains(out.bytes, 'JFIF'.codeUnits), isTrue);
      expect(_contains(out.bytes, [0xFF, 0xDB]), isTrue, reason: 'DQT kept');
      expect(_contains(out.bytes, [0x12, 0x34, 0xFF, 0x00, 0x56]), isTrue);
      expect(out.bytes.first, 0xFF);
      expect(out.bytes[1], 0xD8);
      expect(out.bytes.last, 0xD9);
      expect(out.bytes.length, lessThan(input.length));
    });

    test('JPEG without metadata passes through byte-for-byte equal', () {
      final once =
          (sanitizePhotoForUpload(jpegWithExif()) as SanitizedPhoto).bytes;
      final twice = (sanitizePhotoForUpload(once) as SanitizedPhoto).bytes;
      expect(twice, once);
    });

    test('JPEG that is truncated or has a bad segment length is REFUSED', () {
      final input = jpegWithExif();
      final truncated = Uint8List.sublistView(input, 0, 30);
      expect(
        sanitizePhotoForUpload(truncated),
        isA<UnsendablePhoto>().having(
          (u) => u.reason,
          'reason',
          UnsendablePhotoReason.malformed,
        ),
      );
      final badLen = Uint8List.fromList([
        0xFF,
        0xD8,
        0xFF,
        0xE1,
        0xFF,
        0xFF,
        1,
        2,
        3,
      ]);
      expect(sanitizePhotoForUpload(badLen), isA<UnsendablePhoto>());
    });

    test('JPEG: everything AFTER EOI is dropped (EXIF trailer, MPF image, '
        'motion-photo MP4)', () {
      final trailer = [
        0xFF,
        0xD8,
        0xFF,
        0xE1,
        0x00,
        0x0A,
        ...'Exif\u0000\u0000TR'.codeUnits,
        ...'GPS-TRAILER'.codeUnits,
        0,
        0,
        0,
        0x18,
        ...'ftypmp42'.codeUnits,
      ];
      final input = Uint8List.fromList([...jpegWithExif(), ...trailer]);
      expect(_contains(input, 'GPS-TRAILER'.codeUnits), isTrue, reason: 'fx');
      final out = (sanitizePhotoForUpload(input) as SanitizedPhoto).bytes;
      expect(out.last, 0xD9);
      expect(_contains(out, 'GPS-TRAILER'.codeUnits), isFalse);
      expect(_contains(out, 'ftyp'.codeUnits), isFalse);
      expect(
        out,
        (sanitizePhotoForUpload(jpegWithExif()) as SanitizedPhoto).bytes,
        reason: 'identical to the file without the trailer',
      );
    });

    test('JPEG: APP2 is kept only for ICC_PROFILE; MPF is dropped', () {
      List<int> app2(List<int> payload) => [
        0xFF,
        0xE2,
        (payload.length + 2) >> 8,
        (payload.length + 2) & 0xFF,
        ...payload,
      ];
      final icc = [...'ICC_PROFILE'.codeUnits, 0, 1, 1, 9, 9];
      final mpf = [...'MPF'.codeUnits, 0, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
      Uint8List file(List<int> seg) => Uint8List.fromList([
        0xFF,
        0xD8,
        ...seg,
        0xFF,
        0xDA,
        0,
        4,
        0,
        0,
        1,
        2,
        0xFF,
        0xD9,
      ]);
      final keepIcc =
          (sanitizePhotoForUpload(file(app2(icc))) as SanitizedPhoto).bytes;
      expect(_contains(keepIcc, 'ICC_PROFILE'.codeUnits), isTrue);
      final dropMpf =
          (sanitizePhotoForUpload(file(app2(mpf))) as SanitizedPhoto).bytes;
      expect(_contains(dropMpf, 'MPF'.codeUnits), isFalse);
      // A short APP2 (shorter than the ICC tag) is dropped, not read OOB.
      final tiny =
          (sanitizePhotoForUpload(file(app2([1, 2]))) as SanitizedPhoto).bytes;
      expect(_contains(tiny, [0xFF, 0xE2]), isFalse);
    });

    test('JPEG: progressive file — APP1/COM between scans are filtered, '
        'scan data (FF00, RSTn, fill FFs) is preserved', () {
      final input = Uint8List.fromList([
        0xFF, 0xD8,
        0xFF, 0xC2, 0, 4, 0, 0, // SOF2 (progressive)
        0xFF, 0xDA, 0, 4, 0, 0, // scan 1
        0x11, 0xFF, 0x00, 0x22, 0xFF, 0xD0, 0x33, 0xFF, 0xFF, // data, fill
        0xFF, 0xE1, 0, 12, ...'Exif\u0000\u0000GPS-'.codeUnits, // between scans
        0xFF, 0xFE, 0, 4, 0x68, 0x69, // COM between scans
        0xFF, 0xDA, 0, 4, 0, 0, // scan 2
        0x44, 0x55,
        0xFF, 0xD9,
        ...'GPS-AFTER'.codeUnits,
      ]);
      final out = (sanitizePhotoForUpload(input) as SanitizedPhoto).bytes;
      expect(_contains(out, 'GPS'.codeUnits), isFalse);
      expect(_contains(out, [0xFF, 0xE1]), isFalse);
      expect(_contains(out, [0xFF, 0xFE]), isFalse);
      expect(
        _contains(out, [0x11, 0xFF, 0x00, 0x22, 0xFF, 0xD0, 0x33]),
        isTrue,
      );
      expect(_contains(out, [0x44, 0x55, 0xFF, 0xD9]), isTrue);
      expect(out.last, 0xD9);
    });

    test('JPEG: malformed structures return a refusal, never loop or read '
        'out of bounds', () {
      final bad = <List<int>>[
        [0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x01], // length < 2
        [0xFF, 0xD8, 0xFF, 0xE1, 0xFF], // length cut off
        [0xFF, 0xD8, 0xFF, 0xDA, 0, 4, 0, 0, 1, 2, 3], // no marker after scan
        [0xFF, 0xD8, 0xFF, 0xDA, 0, 4, 0, 0, 0xFF], // ends on FF
        [0xFF, 0xD8, 0x12, 0x34, 0x56, 0x78], // not a marker
        [0xFF, 0xD8, 0xFF, 0x00, 0xFF, 0xD9], // stuffing outside scan
        [0xFF, 0xD8, 0xFF, 0xFF, 0xFF, 0xFF], // only fill bytes
        [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x20, 1, 2], // length past the end
      ];
      for (final b in bad) {
        expect(
          sanitizePhotoForUpload(Uint8List.fromList(b)),
          isA<UnsendablePhoto>(),
          reason: '$b',
        );
      }
    });

    test('PNG: eXIf / tEXt chunks removed, image chunks kept, MIME png', () {
      final out = sanitizePhotoForUpload(_png()) as SanitizedPhoto;
      expect(out.mime, 'image/png');
      expect(_contains(out.bytes, 'eXIf'.codeUnits), isFalse);
      expect(_contains(out.bytes, 'GPS-SECRET'.codeUnits), isFalse);
      expect(_contains(out.bytes, 'tEXt'.codeUnits), isFalse);
      expect(_contains(out.bytes, 'IHDR'.codeUnits), isTrue);
      expect(_contains(out.bytes, 'IDAT'.codeUnits), isTrue);
      expect(_contains(out.bytes, 'IEND'.codeUnits), isTrue);
    });

    test('PNG without IEND is refused', () {
      final p = _png(withMetadata: false);
      final cut = Uint8List.sublistView(p, 0, p.length - 12);
      expect(sanitizePhotoForUpload(cut), isA<UnsendablePhoto>());
    });

    test(
      'WebP: EXIF chunk and the VP8X EXIF flag removed; RIFF size fixed',
      () {
        final input = _webp();
        final out = sanitizePhotoForUpload(input) as SanitizedPhoto;
        expect(out.mime, 'image/webp');
        expect(_contains(out.bytes, 'EXIF'.codeUnits), isFalse);
        expect(_contains(out.bytes, 'GPS-SECRET'.codeUnits), isFalse);
        expect(_contains(out.bytes, 'VP8 '.codeUnits), isTrue);
        final riff =
            out.bytes[4] |
            (out.bytes[5] << 8) |
            (out.bytes[6] << 16) |
            (out.bytes[7] << 24);
        expect(riff + 8, out.bytes.length);
        // VP8X flags byte: chunk header (8) after "RIFF....WEBP" (12).
        expect(out.bytes[12 + 8] & 0x0C, 0);
      },
    );

    test('HEIC is refused (metadata cannot be removed safely)', () {
      final heic = Uint8List.fromList([
        0,
        0,
        0,
        0x18,
        ...'ftypheic'.codeUnits,
        0,
        0,
        0,
        0,
        1,
        2,
        3,
        4,
      ]);
      expect(
        sanitizePhotoForUpload(heic),
        isA<UnsendablePhoto>().having(
          (u) => u.reason,
          'reason',
          UnsendablePhotoReason.metadataNotRemovable,
        ),
      );
    });

    test('unrecognised bytes are refused, never sent labelled as JPEG', () {
      expect(
        sanitizePhotoForUpload(Uint8List.fromList([1, 2, 3, 4, 5, 6, 7, 8])),
        isA<UnsendablePhoto>().having(
          (u) => u.reason,
          'reason',
          UnsendablePhotoReason.unrecognisedFormat,
        ),
      );
    });
  });
}
