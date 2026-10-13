// What leaves the device when a photo is sent to a BYOK endpoint (N1).
//
// Two guarantees, enforced HERE — at the single egress point, not left to
// the camera plugin:
//
//   1. the MIME type is the real one, read from the file's magic bytes
//      (the old code hard-coded `image/jpeg` for everything);
//   2. embedded metadata — EXIF (GPS position, device model, timestamps),
//      XMP, IPTC, comments — is removed.
//
// Why not rely on `image_picker`'s `maxWidth` / `imageQuality` re-encode to
// drop EXIF? Its Android implementation deliberately copies the EXIF tags
// (including GPS) from the original onto the resized file, and the iOS /
// web behaviour is not documented as a guarantee. So the strip is explicit:
//
//   * JPEG  — drop APP1 (EXIF/XMP), APP2 unless it is an ICC profile (MPF),
//             APP3..APP13 (meta, IPTC) and COM segments — including those
//             between progressive scans — and everything after EOI; pixel
//             data is copied untouched.
//   * PNG   — drop `eXIf`, `tEXt`, `zTXt`, `iTXt`, `tIME` chunks.
//   * WebP  — drop the `EXIF` and `XMP ` chunks, clear their VP8X flags,
//             fix the RIFF size.
//   * HEIC / HEIF — the metadata lives inside the container's `meta` box
//             with absolute offsets; stripping it safely needs a real ISO
//             BMFF writer. Fail CLOSED: refuse to send it.
//   * anything else, or a malformed file — refuse.
//
// Pure Dart (no `dart:io`, no Flutter) so it runs on web and is unit
// tested. A refusal is a typed result, never an exception.

import 'dart:typed_data';

/// The image formats the magic-byte sniffer knows.
enum PhotoFormat {
  jpeg('image/jpeg'),
  png('image/png'),
  webp('image/webp'),
  heic('image/heic');

  const PhotoFormat(this.mime);

  final String mime;
}

/// The format of [bytes] by magic number, or `null` when unrecognised.
PhotoFormat? detectPhotoFormat(Uint8List bytes) {
  if (bytes.length >= 3 &&
      bytes[0] == 0xFF &&
      bytes[1] == 0xD8 &&
      bytes[2] == 0xFF) {
    return PhotoFormat.jpeg;
  }
  if (bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47 &&
      bytes[4] == 0x0D &&
      bytes[5] == 0x0A &&
      bytes[6] == 0x1A &&
      bytes[7] == 0x0A) {
    return PhotoFormat.png;
  }
  if (bytes.length >= 12 &&
      _ascii(bytes, 0, 'RIFF') &&
      _ascii(bytes, 8, 'WEBP')) {
    return PhotoFormat.webp;
  }
  if (bytes.length >= 12 && _ascii(bytes, 4, 'ftyp')) {
    const brands = {
      'heic',
      'heix',
      'hevc',
      'hevx',
      'heim',
      'heis',
      'hevm',
      'hevs',
      'mif1',
      'msf1',
    };
    final brand = String.fromCharCodes(bytes.sublist(8, 12));
    if (brands.contains(brand)) return PhotoFormat.heic;
  }
  return null;
}

/// Outcome of [sanitizePhotoForUpload].
sealed class PhotoSanitizeResult {
  const PhotoSanitizeResult();
}

/// Safe to upload: [bytes] carry no metadata, [mime] is the true type.
final class SanitizedPhoto extends PhotoSanitizeResult {
  const SanitizedPhoto({required this.bytes, required this.mime});

  final Uint8List bytes;
  final String mime;
}

enum UnsendablePhotoReason {
  /// Not a JPEG / PNG / WebP / HEIC at all.
  unrecognisedFormat,

  /// A format whose metadata cannot be removed safely here (HEIC).
  metadataNotRemovable,

  /// Truncated or structurally invalid.
  malformed,
}

/// Refused: the photo is NOT sent. The rung maps this to a calm failure.
final class UnsendablePhoto extends PhotoSanitizeResult {
  const UnsendablePhoto(this.reason);

  final UnsendablePhotoReason reason;
}

/// Strip metadata from [bytes] and report the real MIME type.
PhotoSanitizeResult sanitizePhotoForUpload(Uint8List bytes) {
  final format = detectPhotoFormat(bytes);
  if (format == null) {
    return const UnsendablePhoto(UnsendablePhotoReason.unrecognisedFormat);
  }
  final Uint8List? stripped = switch (format) {
    PhotoFormat.jpeg => stripJpegMetadata(bytes),
    PhotoFormat.png => stripPngMetadata(bytes),
    PhotoFormat.webp => stripWebpMetadata(bytes),
    PhotoFormat.heic => null,
  };
  if (stripped != null) {
    return SanitizedPhoto(bytes: stripped, mime: format.mime);
  }
  return UnsendablePhoto(
    format == PhotoFormat.heic
        ? UnsendablePhotoReason.metadataNotRemovable
        : UnsendablePhotoReason.malformed,
  );
}

bool _ascii(Uint8List b, int offset, String s) {
  if (offset + s.length > b.length) return false;
  for (var i = 0; i < s.length; i++) {
    if (b[offset + i] != s.codeUnitAt(i)) return false;
  }
  return true;
}

const List<int> _iccTag = [
  0x49,
  0x43,
  0x43,
  0x5F,
  0x50,
  0x52,
  0x4F,
  0x46,
  0x49,
  0x4C,
  0x45,
  0x00,
]; // "ICC_PROFILE\0"

/// Whether the APPn/COM segment with [marker], whose payload starts at
/// [payloadStart] (length [payloadLen]), is dropped. Dropped: APP1 (EXIF,
/// XMP), APP3..APP13 (meta, IPTC), COM, and APP2 unless it is a real ICC
/// profile (APP2 also carries MPF, the multi-picture index that points at
/// embedded secondary images). Kept: APP0 (JFIF), APP14 (Adobe colour
/// transform), APP15 and every structural segment.
bool _dropJpegSegment(
  Uint8List b,
  int marker,
  int payloadStart,
  int payloadLen,
) {
  if (marker == 0xE1 || (marker >= 0xE3 && marker <= 0xED) || marker == 0xFE) {
    return true;
  }
  if (marker == 0xE2) {
    if (payloadLen < _iccTag.length) return true;
    for (var k = 0; k < _iccTag.length; k++) {
      if (b[payloadStart + k] != _iccTag[k]) return true;
    }
  }
  return false;
}

/// Returns [bytes] without metadata, or `null` if malformed.
///
/// Walks the WHOLE file structurally: after each start-of-scan it steps
/// through the entropy-coded data (skipping `FF00` stuffing, `RSTn` and fill
/// bytes) to the next real marker and re-enters the segment loop, so segments
/// between the scans of a progressive JPEG are filtered too. It stops at the
/// first EOI and DROPS EVERYTHING AFTER IT — trailers (Samsung, motion-photo
/// MP4, MPF secondary images, a second copy of the EXIF) are not part of the
/// image. Every index is bounds-checked and every iteration advances.
Uint8List? stripJpegMetadata(Uint8List bytes) {
  final n = bytes.length;
  if (n < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8) return null;
  final out = BytesBuilder(copy: false)..add(const [0xFF, 0xD8]);
  var i = 2;
  while (true) {
    if (i >= n || bytes[i] != 0xFF) return null;
    // Any number of 0xFF fill bytes may precede the marker code.
    while (i < n && bytes[i] == 0xFF) {
      i++;
    }
    if (i >= n) return null;
    final marker = bytes[i];
    final markerStart = i - 1;
    i++;
    if (marker == 0x00) return null; // stuffing outside a scan
    if (marker == 0xD9) {
      out.add(const [0xFF, 0xD9]);
      return out.takeBytes(); // trailer after EOI is dropped
    }
    // Standalone markers (TEM, RSTn, a stray SOI) carry no length.
    if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD8)) {
      out.add(bytes.sublist(markerStart, i));
      continue;
    }
    if (i + 2 > n) return null;
    final length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > n) return null;
    if (marker == 0xDA) {
      // SOS header, then the entropy-coded data up to the next marker.
      var j = i + length;
      while (true) {
        if (j + 1 >= n) return null; // truncated inside the scan
        if (bytes[j] != 0xFF) {
          j++;
          continue;
        }
        final next = bytes[j + 1];
        if (next == 0x00 || (next >= 0xD0 && next <= 0xD7)) {
          j += 2; // stuffed byte / restart marker: still scan data
        } else if (next == 0xFF) {
          j++; // fill byte
        } else {
          break; // a real marker starts at j
        }
      }
      out.add(bytes.sublist(markerStart, j));
      i = j;
      continue;
    }
    if (!_dropJpegSegment(bytes, marker, i + 2, length - 2)) {
      out.add(bytes.sublist(markerStart, i + length));
    }
    i += length;
  }
}

const Set<String> _pngMetadataChunks = {'eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'};

/// Returns [bytes] without metadata chunks, or `null` if malformed.
Uint8List? stripPngMetadata(Uint8List bytes) {
  if (bytes.length < 8 + 12) return null;
  final out = BytesBuilder(copy: false)..add(bytes.sublist(0, 8));
  var i = 8;
  var sawEnd = false;
  while (i + 12 <= bytes.length) {
    final length =
        (bytes[i] << 24) |
        (bytes[i + 1] << 16) |
        (bytes[i + 2] << 8) |
        bytes[i + 3];
    final end = i + 12 + length;
    if (length < 0 || end > bytes.length) return null;
    final type = String.fromCharCodes(bytes.sublist(i + 4, i + 8));
    if (!_pngMetadataChunks.contains(type)) {
      out.add(bytes.sublist(i, end));
    }
    i = end;
    if (type == 'IEND') {
      sawEnd = true;
      break;
    }
  }
  return sawEnd ? out.takeBytes() : null;
}

/// Returns [bytes] without EXIF / XMP chunks, or `null` if malformed.
Uint8List? stripWebpMetadata(Uint8List bytes) {
  if (bytes.length < 12) return null;
  final riffSize =
      bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
  if (riffSize < 0 || riffSize + 8 > bytes.length) return null;
  final limit = riffSize + 8;
  final body = BytesBuilder(copy: false);
  var i = 12;
  while (i + 8 <= limit) {
    final type = String.fromCharCodes(bytes.sublist(i, i + 4));
    final size =
        bytes[i + 4] |
        (bytes[i + 5] << 8) |
        (bytes[i + 6] << 16) |
        (bytes[i + 7] << 24);
    if (size < 0) return null;
    final padded = size + (size & 1);
    final end = i + 8 + padded;
    if (end > limit) return null;
    if (type != 'EXIF' && type != 'XMP ') {
      final chunk = Uint8List.fromList(bytes.sublist(i, end));
      if (type == 'VP8X' && size >= 10) {
        chunk[8] &= ~0x0C; // clear the XMP (0x04) and EXIF (0x08) flags
      }
      body.add(chunk);
    }
    i = end;
  }
  final payload = body.takeBytes();
  final total = 4 + payload.length; // "WEBP" + chunks
  final out = BytesBuilder(copy: false)
    ..add(const [0x52, 0x49, 0x46, 0x46]) // RIFF
    ..add([
      total & 0xFF,
      (total >> 8) & 0xFF,
      (total >> 16) & 0xFF,
      (total >> 24) & 0xFF,
    ])
    ..add(const [0x57, 0x45, 0x42, 0x50]) // WEBP
    ..add(payload);
  return out.takeBytes();
}
