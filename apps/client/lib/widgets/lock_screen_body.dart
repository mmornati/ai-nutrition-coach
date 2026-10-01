// The unlock surface of the web store (Story 4.1 / AD-8, Phase 2B).
//
// A passphrase field, an unlock pill, one calm line for each failure, and a
// quiet "Forgot your passphrase?" disclosure that states the hard fact
// (unrecoverable) and offers the one way forward: erase and start over.
//
// W4: `_busy` is reset on EVERY outcome (the previous version left the
// spinner stuck after a successful unlock). W7: the passphrase field is
// cleared after every attempt, so the text does not linger in the widget
// tree; the Dart `String` itself cannot be wiped (see `WebSessionKey`).
//
// AD-7: copy is keyed, never interpolated (`WebSessionStrings`).
// NFR7: 48px touch targets, screen-reader labels, no motion.

import 'package:flutter/material.dart';
import 'package:integrations/integrations.dart';

class LockScreenBody extends StatefulWidget {
  const LockScreenBody({
    super.key,
    required this.onUnlock,
    required this.palette,
    this.onForgot,
    this.copy = enWebSessionStrings,
  });

  /// Try the passphrase; the parent wires `WebStoreController.unlock`.
  final Future<WebUnlockOutcome> Function(String passphrase) onUnlock;

  /// Run the erase-and-start-over flow. Returns a message to show when it
  /// failed, `null` otherwise. `null` callback hides the disclosure.
  final Future<String?> Function()? onForgot;

  final WebSessionStrings copy;
  final LockScreenPalette palette;

  @override
  State<LockScreenBody> createState() => _LockScreenBodyState();
}

class _LockScreenBodyState extends State<LockScreenBody> {
  final TextEditingController _controller = TextEditingController();
  bool _busy = false;
  bool _forgotOpen = false;
  String? _message;

  @override
  void dispose() {
    _controller.clear();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final passphrase = _controller.text;
    if (passphrase.isEmpty) {
      setState(() => _message = widget.copy.wrongPassphrase);
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    String? message;
    try {
      final outcome = await widget.onUnlock(passphrase);
      message = switch (outcome) {
        WebUnlocked() || WebStoreDataMissing() => null,
        WebWrongPassphrase() ||
        WebPassphraseRejected() => widget.copy.wrongPassphrase,
        WebThrottled() => widget.copy.throttled,
        WebStoreUnavailable() => widget.copy.unavailable,
        WebStoreInUseElsewhere() => widget.copy.inOtherTab,
      };
    } on Object {
      message = widget.copy.unavailable;
    } finally {
      // W7: never leave the attempt in the field. W4: always un-busy.
      _controller.clear();
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _message = message;
    });
  }

  Future<void> _forgot() async {
    final run = widget.onForgot;
    if (run == null || _busy) return;
    setState(() => _busy = true);
    String? message;
    try {
      message = await run();
    } on Object {
      message = widget.copy.unavailable;
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _message = message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final copy = widget.copy;
    final muted = TextStyle(color: widget.palette.muted, fontSize: 14);
    return Semantics(
      label: copy.label,
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                copy.label,
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
                enableSuggestions: false,
                autocorrect: false,
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: copy.placeholder,
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
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(copy.unlock),
                ),
              ),
              if (_message != null) ...[
                const SizedBox(height: 16),
                Text(_message!, style: muted, textAlign: TextAlign.center),
              ],
              if (widget.onForgot != null) ...[
                const SizedBox(height: 24),
                Align(
                  child: TextButton(
                    onPressed: _busy
                        ? null
                        : () => setState(() => _forgotOpen = !_forgotOpen),
                    child: Text(copy.forgot),
                  ),
                ),
                if (_forgotOpen) ...[
                  Text(copy.forgotBody, style: muted),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 48,
                    child: OutlinedButton(
                      onPressed: _busy ? null : _forgot,
                      child: Text(copy.forgotAction),
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// The minimum palette the bodies need to render — kept here so the
/// `apps/client` screens can pass their own `AppPalette`-shaped values
/// without dragging the apps/client theme tokens into `integrations`.
class LockScreenPalette {
  const LockScreenPalette({required this.ink, required this.muted});

  final Color ink;
  final Color muted;
}
