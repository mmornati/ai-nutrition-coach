// A SHA-256 fingerprint of the photo bytes, used only to bind a one-shot
// upload permit to the exact photo the person said yes to (never sent, never
// stored).

import 'dart:typed_data';

import 'package:crypto/crypto.dart';

String photoDigest(Uint8List bytes) => sha256.convert(bytes).toString();
