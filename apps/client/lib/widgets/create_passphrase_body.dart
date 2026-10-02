// First-run "create your passphrase" surface (Phase 2B / W6).
//
// Enter + confirm, a minimum-strength floor (10 characters, at least 4
// distinct), and the unrecoverability warning shown BEFORE the passphrase is
// set -- not buried after. A typo can no longer silently become the key:
// the two fields must match.
//
// W7: both fields are cleared after every attempt. AD-7: keyed copy.

import 'package:flutter/material.dart';
import 'package:integrations/integrations.dart';

import 'lock_screen_body.dart' show LockScreenPalette;

class CreatePassphraseBody extends StatefulWidget {
  const CreatePassphraseBody({
    super.key,
    required this.onCreate,
    required this.palette,
    this.copy = enWebSessionStrings,
  });

  /// Create the store with the passphrase; wires
  /// `WebStoreController.createStore`.
  final Future<WebUnlockOutcome> Function(String passphrase) onCreate;

  final WebSessionStrings copy;
  final LockScreenPalette palette;

  @override
  State<CreatePassphraseBody> createState() => _CreatePassphraseBodyState();
}

class _CreatePassphraseBodyState extends State<CreatePassphraseBody> {
  final TextEditingController _passphrase = TextEditingController();
  final TextEditingController _confirm = TextEditingController();
  bool _busy = false;
  String? _message;

  @override
  void dispose() {
    _passphrase.clear();
    _confirm.clear();
    _passphrase.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String? _issueText(WebPassphraseIssue issue) => switch (issue) {
    WebPassphraseIssue.tooShort => widget.copy.tooShort,
    WebPassphraseIssue.tooRepetitive => widget.copy.tooRepetitive,
  };

  Future<void> _submit() async {
    if (_busy) return;
    final passphrase = _passphrase.text;
    final issue = validateNewPassphrase(passphrase);
    if (issue != null) {
      setState(() => _message = _issueText(issue));
      return;
    }
    if (passphrase != _confirm.text) {
      setState(() => _message = widget.copy.mismatch);
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    String? message;
    try {
      final outcome = await widget.onCreate(passphrase);
      message = switch (outcome) {
        WebUnlocked() => null,
        WebPassphraseRejected(:final issue) => _issueText(issue),
        WebStoreInUseElsewhere() => widget.copy.inOtherTab,
        WebStoreNewerVersion() => widget.copy.newerVersion,
        WebWrongPassphrase() ||
        WebThrottled() ||
        WebStoreUnavailable() ||
        WebStoreDataMissing() => widget.copy.unavailable,
      };
    } on Object {
      message = widget.copy.unavailable;
    } finally {
      _passphrase.clear();
      _confirm.clear();
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _message = message;
    });
  }

  InputDecoration _decoration(String label) => InputDecoration(
    labelText: label,
    border: const OutlineInputBorder(),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
  );

  @override
  Widget build(BuildContext context) {
    final copy = widget.copy;
    final muted = TextStyle(color: widget.palette.muted, fontSize: 14);
    return Semantics(
      label: copy.createTitle,
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                copy.createTitle,
                style: TextStyle(
                  fontSize: 22,
                  color: widget.palette.ink,
                  fontWeight: FontWeight.w400,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(copy.createExplain, style: muted),
              const SizedBox(height: 12),
              Text(
                copy.createWarning,
                style: muted.copyWith(color: widget.palette.ink),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passphrase,
                obscureText: true,
                autofocus: true,
                enableSuggestions: false,
                autocorrect: false,
                textInputAction: TextInputAction.next,
                decoration: _decoration(copy.createPassphraseLabel),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _confirm,
                obscureText: true,
                enableSuggestions: false,
                autocorrect: false,
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _submit(),
                decoration: _decoration(copy.createConfirmLabel),
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
                      : Text(copy.createAction),
                ),
              ),
              if (_message != null) ...[
                const SizedBox(height: 16),
                Text(_message!, style: muted, textAlign: TextAlign.center),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
