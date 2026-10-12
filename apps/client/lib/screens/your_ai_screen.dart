// Settings → Your AI (Phase 3 / F5, FR7, N1, N7, S1, S4).
//
// One calm screen, top to bottom:
//   1. choose how photos are recognised — No AI, or My own key. The hosted
//      and on-device rungs are listed as "Not available yet" and cannot be
//      chosen (the hosted tier needs a server-side relay that does not
//      exist; the local rung is a v2 seam);
//   2. when "My own key" is chosen: the endpoint (https required; plain
//      http only for localhost / 127.0.0.1 / ::1), the model, and the key;
//   3. Test connection, Save, Remove key;
//   4. the hosts the user has agreed to send photos to, each revocable.
//
// The key:
//   * is typed or pasted into an OBSCURED field (no suggestions, no
//     autocorrect, no IME learning; whitespace — such as the newline a paste
//     tends to drag along — is filtered out);
//   * is NEVER displayed back. The only trace on screen is
//     "key saved • ends with ••••abcd" (last four characters, and only for
//     keys long enough that this reveals little);
//   * the field is cleared after every save.
//
// Changes apply immediately (the rung is runtime state, F5). Copy is keyed
// in `YourAiStrings` (AD-7); every message is calm — no red, no urgency.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show FilteringTextInputFormatter;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/ai_settings_provider.dart';
import '../state/your_ai_provider.dart';
import '../theme/app_tokens.dart';
import 'privacy_screen.dart';

class YourAiScreen extends ConsumerStatefulWidget {
  const YourAiScreen({super.key, this.copy = enYourAiStrings});

  final YourAiStrings copy;

  @override
  ConsumerState<YourAiScreen> createState() => _YourAiScreenState();
}

class _YourAiScreenState extends ConsumerState<YourAiScreen> {
  late final TextEditingController _endpoint;
  late final TextEditingController _model;
  final TextEditingController _key = TextEditingController();

  late bool _byokSelected;
  bool _busy = false;
  bool _testing = false;
  String? _endpointError;
  String? _modelError;
  String? _message;

  @override
  void initState() {
    super.initState();
    final settings = ref.read(aiSettingsProvider);
    const defaults = BuildConfig();
    // Non-secret build-time defaults only pre-fill an empty form.
    _endpoint = TextEditingController(
      text: settings.byokEndpointUrl.isNotEmpty
          ? settings.byokEndpointUrl
          : defaults.byokEndpointUrl,
    );
    _model = TextEditingController(
      text: settings.byokModel.isNotEmpty
          ? settings.byokModel
          : defaults.byokModel,
    );
    _byokSelected = settings.rung.kind == AiRungKind.byok;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(yourAiProvider.notifier).refreshKeyPresence();
    });
  }

  @override
  void dispose() {
    _endpoint.dispose();
    _model.dispose();
    _key.dispose();
    super.dispose();
  }

  YourAiStrings get _c => widget.copy;

  String _endpointProblemText(ByokEndpointProblem p) => switch (p) {
    ByokEndpointProblem.empty => _c.endpointEmpty,
    ByokEndpointProblem.notAUrl => _c.endpointNotAUrl,
    ByokEndpointProblem.notHttps => _c.endpointNotHttps,
    ByokEndpointProblem.hasCredentials => _c.endpointHasCredentials,
    ByokEndpointProblem.hasQueryOrFragment => _c.endpointHasQuery,
  };

  Future<void> _selectNoAi() async {
    setState(() {
      _byokSelected = false;
      _message = null;
    });
    await ref.read(yourAiProvider.notifier).selectNoAi();
  }

  Future<void> _save() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = null;
      _endpointError = null;
      _modelError = null;
    });
    final result = await ref
        .read(yourAiProvider.notifier)
        .saveByok(
          endpointUrl: _endpoint.text,
          model: _model.text,
          newKey: _key.text,
        );
    if (!mounted) return;
    setState(() {
      _busy = false;
      switch (result) {
        case SaveByokSaved():
          _key.clear();
          _message = _c.saved;
        case SaveByokEndpointInvalid(:final problem):
          _endpointError = _endpointProblemText(problem);
        case SaveByokModelMissing():
          _modelError = _c.modelEmpty;
        case SaveByokKeyInvalid():
          _message = _c.keyInvalid;
        case SaveByokKeyMissing():
          _message = _c.testNotConfigured;
        case SaveByokKeyForOtherHost(:final savedFor):
          _message = _c.keyOtherHost.replaceAll('{host}', savedFor);
        case SaveByokStorageFailed():
          _message = _c.testNetwork;
      }
    });
  }

  Future<void> _removeKey() async {
    if (_busy) return;
    setState(() => _busy = true);
    await ref.read(yourAiProvider.notifier).removeByok();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _key.clear();
      _byokSelected = false;
      _message = _c.keyRemoved;
    });
  }

  Future<void> _test() async {
    if (_testing) return;
    setState(() {
      _testing = true;
      _message = null;
      _endpointError = null;
    });
    final result = await ref
        .read(yourAiProvider.notifier)
        .testConnection(
          endpointUrl: _endpoint.text,
          model: _model.text,
          typedKey: _key.text,
        );
    if (!mounted) return;
    setState(() {
      _testing = false;
      switch (result) {
        case ByokConnectionOk():
          _message = _c.testOk;
        case ByokConnectionKeyRejected():
          _message = _c.testKeyRejected;
        case ByokConnectionRateLimited():
          _message = _c.testRateLimited;
        case ByokConnectionEndpointInvalid(:final problem):
          _endpointError = _endpointProblemText(problem);
        case ByokConnectionNotConfigured():
          _message = _c.testNotConfigured;
        case ByokConnectionKeyForOtherHost():
          _message = _c.testKeyOtherHost;
        case ByokConnectionResponseTooLarge():
          _message = _c.testTooLarge;
        case ByokConnectionUnreachable(:final reason):
          _message = reason == ByokUnreachableReason.timeout
              ? _c.testTimeout
              : _c.testNetwork;
        case ByokConnectionUnexpectedStatus(:final statusCode):
          _message = _c.testUnexpected.replaceAll('{status}', '$statusCode');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final state = ref.watch(yourAiProvider);
    final settings = ref.watch(aiSettingsProvider);
    final muted = AppTypography.coach.copyWith(color: palette.inkMuted);
    final label = AppTypography.ui.copyWith(color: palette.ink);
    final hosts = settings.photoConsentHosts.toList()..sort();

    return Scaffold(
      backgroundColor: palette.background,
      appBar: AppBar(
        backgroundColor: palette.background,
        elevation: 0,
        title: Text(_c.title, style: label),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            Text(_c.intro, style: muted),
            const SizedBox(height: AppSpacing.lg),
            Semantics(header: true, child: Text(_c.rungHeading, style: muted)),
            const SizedBox(height: AppSpacing.xs),
            _rungTile(
              palette,
              title: _c.rungNoneLabel,
              help: _c.rungNoneHelp,
              selected: !_byokSelected,
              onTap: _selectNoAi,
            ),
            _rungTile(
              palette,
              title: _c.rungByokLabel,
              help: _c.rungByokHelp,
              selected: _byokSelected,
              onTap: () => setState(() => _byokSelected = true),
            ),
            _rungTile(
              palette,
              title: _c.rungHostedLabel,
              help: _c.rungUnavailable,
              selected: false,
              onTap: null,
            ),
            _rungTile(
              palette,
              title: _c.rungLocalLabel,
              help: _c.rungUnavailable,
              selected: false,
              onTap: null,
            ),
            if (_byokSelected) ...[
              const SizedBox(height: AppSpacing.lg),
              const Divider(height: AppSpacing.hairline),
              const SizedBox(height: AppSpacing.lg),
              Semantics(
                header: true,
                child: Text(_c.byokHeading, style: muted),
              ),
              const SizedBox(height: AppSpacing.sm),
              TextField(
                controller: _endpoint,
                keyboardType: TextInputType.url,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(
                  labelText: _c.endpointLabel,
                  hintText: _c.endpointHint,
                  helperText: _c.endpointHelp,
                  helperMaxLines: 3,
                  errorText: _endpointError,
                  errorMaxLines: 3,
                ),
                onChanged: (_) {
                  if (_endpointError != null) {
                    setState(() => _endpointError = null);
                  }
                },
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: _model,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(
                  labelText: _c.modelLabel,
                  hintText: _c.modelHint,
                  errorText: _modelError,
                  errorMaxLines: 3,
                ),
                onChanged: (_) {
                  if (_modelError != null) setState(() => _modelError = null);
                },
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: _key,
                obscureText: true,
                autocorrect: false,
                enableSuggestions: false,
                enableIMEPersonalizedLearning: false,
                keyboardType: TextInputType.visiblePassword,
                // A paste often carries a trailing newline or spaces; a key
                // never contains whitespace.
                inputFormatters: [
                  FilteringTextInputFormatter.deny(RegExp(r'\s')),
                ],
                decoration: InputDecoration(
                  labelText: _c.keyLabel,
                  hintText: _c.keyHint,
                  helperText: kIsWeb ? _c.keyHelpWeb : _c.keyHelp,
                  helperMaxLines: 4,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Semantics(
                liveRegion: true,
                child: Text(
                  state.hasKey
                      ? (state.keyEnding == null
                            ? _c.keySavedPlain
                            : _c.keySavedTemplate.replaceAll(
                                '{last4}',
                                state.keyEnding!,
                              ))
                      : _c.keyNone,
                  style: AppTypography.mono.copyWith(color: palette.inkMuted),
                ),
              ),
              if (state.hasKey)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: Text(_c.keyReplaceHint, style: muted),
                ),
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  _button(_c.save, _busy ? null : _save),
                  _button(
                    _testing ? _c.testing : _c.testConnection,
                    _testing ? null : _test,
                  ),
                  if (state.hasKey)
                    _button(_c.removeKey, _busy ? null : _removeKey),
                ],
              ),
            ],
            if (_message != null) ...[
              const SizedBox(height: AppSpacing.md),
              Semantics(liveRegion: true, child: Text(_message!, style: muted)),
            ],
            const SizedBox(height: AppSpacing.lg),
            const Divider(height: AppSpacing.hairline),
            const SizedBox(height: AppSpacing.lg),
            Semantics(
              header: true,
              child: Text(_c.privacyHeading, style: muted),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(_c.consentExplainer, style: muted),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(_c.askEveryPhotoLabel, style: label),
              subtitle: Text(_c.askEveryPhotoHelp, style: muted),
              value: settings.askBeforeEveryPhoto,
              onChanged: (v) => ref
                  .read(aiSettingsProvider.notifier)
                  .setAskBeforeEveryPhoto(v),
            ),
            const SizedBox(height: AppSpacing.sm),
            if (hosts.isEmpty)
              Text(_c.consentNone, style: muted)
            else
              for (final host in hosts) _consentRow(palette, host),
            const SizedBox(height: AppSpacing.sm),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                style: TextButton.styleFrom(
                  minimumSize: const Size(
                    AppTouchTargets.min,
                    AppTouchTargets.min,
                  ),
                ),
                onPressed: _openPrivacyPage,
                child: Text(_c.docsHint),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openPrivacyPage() => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => const PrivacyScreen()));

  Widget _button(String text, VoidCallback? onPressed) => SizedBox(
    height: AppTouchTargets.min,
    child: OutlinedButton(onPressed: onPressed, child: Text(text)),
  );

  Widget _consentRow(AppPalette palette, String host) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppTouchTargets.min),
      child: Row(
        children: [
          Expanded(
            child: Text(
              host,
              style: AppTypography.mono.copyWith(color: palette.ink),
            ),
          ),
          TextButton(
            style: TextButton.styleFrom(
              minimumSize: const Size(AppTouchTargets.min, AppTouchTargets.min),
            ),
            onPressed: () =>
                ref.read(aiSettingsProvider.notifier).revokePhotoConsent(host),
            child: Text(_c.consentRevoke),
          ),
        ],
      ),
    );
  }

  /// One selectable (or disabled) rung row. Mutually exclusive group
  /// semantics so a screen reader announces "radio, selected".
  Widget _rungTile(
    AppPalette palette, {
    required String title,
    required String help,
    required bool selected,
    required VoidCallback? onTap,
  }) {
    final enabled = onTap != null;
    final ink = enabled ? palette.ink : palette.inkMuted;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      button: true,
      selected: selected,
      enabled: enabled,
      label: '$title. $help',
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppTouchTargets.min),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  selected
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                  color: ink,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: AppTypography.ui.copyWith(color: ink)),
                      Text(
                        help,
                        style: AppTypography.coach.copyWith(
                          color: palette.inkMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
