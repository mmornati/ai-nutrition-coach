// The `LockScreen` widget body (Story 4.1 / AD-8).
//
// Renders the calm passphrase-entry surface. The widget is the body
// of the `UnlockGate` (apps/client) — the first paint on the web
// rung. The user enters a passphrase; the `WebSessionKey` derives a
// session key via PBKDF2; the `WasmEncryptedStore` opens the schema
// with the derived key. On success the gate flips to the Day Board;
// on failure a single calm line says "that passphrase does not open
// this store" (no exception crosses the port).
//
// AD-7: copy is keyed, never interpolated, named NDP reviewer signs
// off. The copy lives in `WebSessionStrings`.
//
// NFR7: 48px touch target on the unlock pill; screen reader
// announces the field by name; reduce-motion collapses the gate
// transition to a fade; dynamic type honored without truncation.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';

import '../l10n/coach_strings.dart';
import 'web_session_key.dart';

/// The body of the `UnlockGate`. Renders the passphrase field + the
/// unlock pill + the calm error line. The parent (`UnlockGate`)
/// decides whether to mount this widget; the body is pure UI.
class LockScreenBody extends StatefulWidget {
  const LockScreenBody({
    super.key,
    required this.sessionKey,
    required this.onTryUnlock,
    required this.palette,
    this.copy = enWebSessionStrings,
  });

  /// The session-key holder the body probes. The probe is async; the
  /// body awaits it and surfaces the typed `LockOutcome`.
  final WebSessionKey sessionKey;

  /// The async probe. Returns `true` if the derived key opens the
  /// wasm store; `false` on a wrong passphrase. The parent injects
  /// the probe so the body stays free of the drift/wasm details.
  final Future<bool> Function(WebSessionKey sessionKey, String passphrase)
      onTryUnlock;

  final WebSessionStrings copy;
  final LockScreenPalette palette;

  @override
  State<LockScreenBody> createState() => _LockScreenBodyState();
}

class _LockScreenBodyState extends State<LockScreenBody> {
  final TextEditingController _controller = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onUnlock() async {
    if (_busy) return;
    final passphrase = _controller.text;
    if (passphrase.isEmpty) {
      setState(() => _error = widget.copy.wrongPassphrase);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ok = await widget.onTryUnlock(widget.sessionKey, passphrase);
      if (!mounted) return;
      if (!ok) {
        setState(() {
          _busy = false;
          _error = widget.copy.wrongPassphrase;
        });
        return;
      }
      // Parent observes the session-key `isOpen` and flips the
      // gate. We don't need to navigate here.
    } on Object {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = widget.copy.wrongPassphrase;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: widget.copy.label,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.copy.label,
              style: TextStyle(
                fontSize: 22,
                color: widget.palette.ink,
                fontWeight: FontWeight.w400,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              obscureText: true,
              autofocus: true,
              textInputAction: TextInputAction.go,
              onSubmitted: (_) => _onUnlock(),
              decoration: InputDecoration(
                hintText: widget.copy.placeholder,
                border: const OutlineInputBorder(),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 14,
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 48,
              child: OutlinedButton(
                onPressed: _busy ? null : _onUnlock,
                child: _busy
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(widget.copy.unlock),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(
                _error!,
                style: TextStyle(
                  color: widget.palette.muted,
                  fontSize: 14,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The minimum palette the body needs to render — kept here so the
/// `apps/client` `UnlockGate` can pass its own `AppPalette`-shaped
/// values without dragging the apps/client theme tokens into
/// `integrations`.
class LockScreenPalette {
  const LockScreenPalette({required this.ink, required this.muted});

  final Color ink;
  final Color muted;
}
