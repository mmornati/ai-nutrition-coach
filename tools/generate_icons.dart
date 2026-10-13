// tools/generate_icons.dart — the AI Nutrition Coach app icon, drawn from one piece of
// geometry (ADR-0003). Deterministic: the same code always writes the same
// bytes, so the committed PNGs can be regenerated and diffed.
//
//   dart run tools/generate_icons.dart
//
// Motif: a calm plate seen from above (cream rim and well) with an open
// balance arc and one warm dot, on the app's sage. Colours are the design
// tokens in apps/client/lib/theme/app_tokens.dart.
//
// Writes
//   tools/icons/ai-nutrition-coach-icon.svg             the source (any-purpose)
//   tools/icons/ai-nutrition-coach-icon-maskable.svg    full-bleed, motif in the safe zone
//   apps/client/web/icons/Icon-192.png, Icon-512.png          (any: rounded)
//   apps/client/web/icons/Icon-maskable-192.png, -512.png     (maskable)
//   apps/client/web/icons/apple-touch-icon.png                (180, opaque)
//   apps/client/web/favicon.png                               (48)
//
// No image library: PNG encoding is a 40-line writer over `dart:io`'s zlib,
// and the shapes are anti-aliased by 4x4 supersampling.
//
// Not touched: the Android mipmaps and the iOS AppIcon set (still the
// Flutter placeholders) -- see docs/pwa.md.

import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

// Colours (AppPalette.light).
const int _sage = 0x6B8E5A;
const int _cream = 0xFBF7EE;
const int _rim = 0xE2DBC6;
const int _sageDeep = 0x3F5A36;
const int _coach = 0x8A5A14;

// Geometry in a 512 x 512 box.
const double _box = 512;
const double _cx = 256;
const double _cy = 256;
const double _plateR = 170; // outer plate
const double _rimInnerR = 150; // well starts here
const double _arcR = 96; // balance arc centre line
const double _arcW = 26; // arc stroke width
const double _arcStart = 135 * math.pi / 180; // lower left, clockwise 270 deg
const double _arcSweep = 270 * math.pi / 180;
const double _dotR = 15;
const double _cornerR = 112; // rounded-square mask of the "any" icon

class _Shape {
  const _Shape(this.contains, this.color);
  final bool Function(double x, double y) contains;
  final int color;
}

double _dist(double x, double y, double cx, double cy) =>
    math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));

bool _inArc(double x, double y) {
  final r = _dist(x, y, _cx, _cy);
  final end = _arcStart + _arcSweep;
  // Round caps.
  for (final a in [_arcStart, end]) {
    final px = _cx + _arcR * math.cos(a);
    final py = _cy + _arcR * math.sin(a);
    if (_dist(x, y, px, py) <= _arcW / 2) return true;
  }
  if ((r - _arcR).abs() > _arcW / 2) return false;
  var angle = math.atan2(y - _cy, x - _cx) - _arcStart; // clockwise from start
  while (angle < 0) {
    angle += 2 * math.pi;
  }
  return angle <= _arcSweep;
}

final List<_Shape> _motif = [
  _Shape((x, y) => _dist(x, y, _cx, _cy) <= _plateR, _rim),
  _Shape((x, y) => _dist(x, y, _cx, _cy) <= _rimInnerR, _cream),
  _Shape(_inArc, _sageDeep),
  _Shape((x, y) => _dist(x, y, _cx, _cy + _arcR) <= _dotR, _coach),
];

bool _inRoundedSquare(double x, double y) {
  const lo = _cornerR;
  const hi = _box - _cornerR;
  final dx = x < lo ? lo - x : (x > hi ? x - hi : 0.0);
  final dy = y < lo ? lo - y : (y > hi ? y - hi : 0.0);
  return dx * dx + dy * dy <= _cornerR * _cornerR;
}

/// RGBA pixels of the icon at [size], motif scaled by [scale] about the
/// centre (maskable icons shrink it into the safe zone), optionally with the
/// rounded-square alpha mask.
Uint8List renderIcon(int size, {required double scale, required bool rounded}) {
  const ss = 4;
  final out = Uint8List(size * size * 4);
  final unit = _box / size;
  for (var py = 0; py < size; py++) {
    for (var px = 0; px < size; px++) {
      var r = 0.0, g = 0.0, b = 0.0, a = 0.0;
      for (var sy = 0; sy < ss; sy++) {
        for (var sx = 0; sx < ss; sx++) {
          final x = (px + (sx + 0.5) / ss) * unit;
          final y = (py + (sy + 0.5) / ss) * unit;
          if (rounded && !_inRoundedSquare(x, y)) continue;
          var color = _sage;
          // Inverse-scale into motif space.
          final mx = _cx + (x - _cx) / scale;
          final my = _cy + (y - _cy) / scale;
          for (final shape in _motif) {
            if (shape.contains(mx, my)) color = shape.color;
          }
          r += (color >> 16) & 0xFF;
          g += (color >> 8) & 0xFF;
          b += color & 0xFF;
          a += 1;
        }
      }
      final i = (py * size + px) * 4;
      const n = ss * ss;
      if (a > 0) {
        out[i] = (r / a).round();
        out[i + 1] = (g / a).round();
        out[i + 2] = (b / a).round();
      }
      out[i + 3] = (255 * a / n).round();
    }
  }
  return out;
}

final Uint32List _crcTable = () {
  final table = Uint32List(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
    }
    table[n] = c;
  }
  return table;
}();

int _crc32(List<int> bytes) {
  var c = 0xFFFFFFFF;
  for (final b in bytes) {
    c = _crcTable[(c ^ b) & 0xFF] ^ (c >> 8);
  }
  return c ^ 0xFFFFFFFF;
}

void _u32(BytesBuilder out, int v) =>
    out.add([(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]);

void _chunk(BytesBuilder out, String type, List<int> data) {
  _u32(out, data.length);
  final body = [...type.codeUnits, ...data];
  out.add(body);
  _u32(out, _crc32(body));
}

/// Encode RGBA pixels as a PNG (8-bit, colour type 6, no interlace).
Uint8List encodePng(int size, Uint8List rgba) {
  final raw = BytesBuilder();
  for (var y = 0; y < size; y++) {
    raw.addByte(0); // filter: none
    raw.add(rgba.sublist(y * size * 4, (y + 1) * size * 4));
  }
  final out = BytesBuilder();
  out.add([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  final header = BytesBuilder();
  _u32(header, size);
  _u32(header, size);
  header.add([8, 6, 0, 0, 0]);
  _chunk(out, 'IHDR', header.toBytes());
  _chunk(out, 'IDAT', ZLibEncoder(level: 9).convert(raw.toBytes()));
  _chunk(out, 'IEND', const []);
  return out.toBytes();
}

String _hex(int c) => '#${c.toRadixString(16).padLeft(6, '0').toUpperCase()}';

/// The SVG source for the same geometry.
String renderSvg({required double scale, required bool rounded}) {
  final sx = _cx + _arcR * math.cos(_arcStart);
  final sy = _cy + _arcR * math.sin(_arcStart);
  final ex = _cx + _arcR * math.cos(_arcStart + _arcSweep);
  final ey = _cy + _arcR * math.sin(_arcStart + _arcSweep);
  String n(double v) =>
      v.toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '');
  final bg = rounded
      ? '<rect width="512" height="512" rx="${n(_cornerR)}" fill="${_hex(_sage)}"/>'
      : '<rect width="512" height="512" fill="${_hex(_sage)}"/>';
  return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <title>AI Nutrition Coach</title>
  $bg
  <g transform="translate(256 256) scale(${n(scale)}) translate(-256 -256)">
    <circle cx="256" cy="256" r="${n(_plateR)}" fill="${_hex(_rim)}"/>
    <circle cx="256" cy="256" r="${n(_rimInnerR)}" fill="${_hex(_cream)}"/>
    <path d="M ${n(sx)} ${n(sy)} A ${n(_arcR)} ${n(_arcR)} 0 1 1 ${n(ex)} ${n(ey)}" fill="none" stroke="${_hex(_sageDeep)}" stroke-width="${n(_arcW)}" stroke-linecap="round"/>
    <circle cx="256" cy="${n(_cy + _arcR)}" r="${n(_dotR)}" fill="${_hex(_coach)}"/>
  </g>
</svg>
''';
}

void main() {
  final root = Directory.current.path;
  if (!File('$root/tools/generate_icons.dart').existsSync()) {
    stderr.writeln('run from the repository root');
    exit(2);
  }
  void png(
    String path,
    int size, {
    required double scale,
    required bool rounded,
  }) {
    File('$root/$path')
      ..createSync(recursive: true)
      ..writeAsBytesSync(
        encodePng(size, renderIcon(size, scale: scale, rounded: rounded)),
      );
    stdout.writeln('wrote $path');
  }

  // "any": the plate fills the icon, rounded corners (transparent).
  png('apps/client/web/icons/Icon-192.png', 192, scale: 1.0, rounded: true);
  png('apps/client/web/icons/Icon-512.png', 512, scale: 1.0, rounded: true);
  // Maskable: full bleed; the motif stays inside the central 80% circle
  // (plate radius 170 * 0.78 = 133 of 256).
  png(
    'apps/client/web/icons/Icon-maskable-192.png',
    192,
    scale: 0.78,
    rounded: false,
  );
  png(
    'apps/client/web/icons/Icon-maskable-512.png',
    512,
    scale: 0.78,
    rounded: false,
  );
  // iOS rounds the corners itself and wants an opaque square.
  png(
    'apps/client/web/icons/apple-touch-icon.png',
    180,
    scale: 0.92,
    rounded: false,
  );
  png('apps/client/web/favicon.png', 48, scale: 1.0, rounded: true);

  File(
    '$root/tools/icons/ai-nutrition-coach-icon.svg',
  ).writeAsStringSync(renderSvg(scale: 1.0, rounded: true));
  File(
    '$root/tools/icons/ai-nutrition-coach-icon-maskable.svg',
  ).writeAsStringSync(renderSvg(scale: 0.78, rounded: false));
  stdout.writeln('wrote tools/icons/*.svg');
}
