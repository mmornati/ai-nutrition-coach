// The v1 `en` coach question key store (AD-7 / NFR3 / FR15 / NFR6 / NFR7).
//
// This is the single typed source for every coach string the app
// renders in Stories 2.2 / 2.3. The named NDP (No-Dark-Patterns)
// reviewer signs off on this file in one review pass — one localized
// question per `(anchor, pattern)` pair, calm and non-judgmental copy
// only.
//
// AD-7: every coach string resolves by key from this typed map.
// Widgets never interpolate strings; the key is the reviewable
// identity and `text` is the verbatim copy.
//
// NFR3: v1 is a bounded curated taxonomy — 3 anchors × 6 patterns =
// 18 entries. No unbounded generative output. The `depthFollowUp`
// anchor follows a `[sure]` tap on a post-resolve whisper; the text
// reuses the calm post-resolve copy so the user sees the same
// non-judgmental nudge one notch deeper. If the reviewer rejects an
// entry, the task is to remove the entry, not add a new one.
//
// FR15: copy is calm, non-judgmental, no calorie-shaming, no
// streak-pressure, no restriction framing. Each entry is one plain
// sentence.
//
// NFR6: when the composition pattern needs a quantity, the copy uses
// honest ranges (`~2 fists`, `a handful`, `a small bowl`). No
// kcal-as-float anywhere in this file.
//
// NFR7: copy is plain text — no decorative unicode, no color tokens,
// no typography references. The UI applies its own theme via the
// existing whisper typography rules.
//
// AD-5: the active implementation (`TemplateCoach`) reads from this
// map. An AI-backed rung (Epic 3+) swaps in behind the same `Coach`
// port without touching this file.
//
// `keyToken` follows the rule `{anchor.keyToken}.{pattern.keyToken}`
// (e.g. `post.resolve.vegLight` for the post-resolve whisper on a
// veg-light plate, `depth.followUp.vegLight` for the depth
// follow-up on the same plate). The convention makes the key
// sortable and greppable for the reviewer.

import 'package:domain_core/domain_core.dart';

/// Builds the canonical key for an `(anchor, pattern)` pair.
///
/// The format is `{anchor.keyToken}.{pattern.keyToken}` — e.g.
/// `post.resolve.vegLight`. Keeping the construction here lets the
/// `TemplateCoach` adapter, the key store entries, and any reviewer
/// tooling agree on the exact spelling without hand-rolling the same
/// string in two places.
String _coachKey(CoachAnchor anchor, CompositionPattern pattern) =>
    '${anchor.keyToken}.${pattern.keyToken}';

/// The v1 `en` coach question key store.
///
/// Three anchors (`postResolve`, `openPlate`, `depthFollowUp`) × six
/// composition patterns (`vegLight`, `proteinHeavy`, `starchHeavy`,
/// `dairyLight`, `vegRich`, `balanced`) = 18 entries. Each entry is
/// a `CoachQuestion` whose `text` is the verbatim calm copy the
/// whisper renders. The `depthFollowUp` entries reuse the calm
/// post-resolve copy so the user sees the same non-judgmental nudge
/// one notch deeper — the key is the reviewable identity, the text
/// is the verbatim copy the active rung hands back.
///
/// The `const` map is evaluated at compile time; the `TemplateCoach`
/// adapter returns the same `CoachQuestion` instance for the same
/// `(anchor, pattern)` pair on every call, so the UI dedupes
/// deterministically on `key`.
final Map<CoachQuestionKey, CoachQuestion> enCoachStrings =
    <CoachQuestionKey, CoachQuestion>{
  // --- post-resolve whisper (Story 2.2 lands the surface) ---
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.vegLight):
      const CoachQuestion(
    key: 'post.resolve.vegLight',
    text: 'A handful of greens would round this plate out.',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.vegLight,
  ),
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.proteinHeavy):
      const CoachQuestion(
    key: 'post.resolve.proteinHeavy',
    text: 'A small bowl of greens or roasted veg would lighten this up.',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.proteinHeavy,
  ),
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.starchHeavy):
      const CoachQuestion(
    key: 'post.resolve.starchHeavy',
    text: 'Some veg on the side would balance this nicely.',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.starchHeavy,
  ),
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.dairyLight):
      const CoachQuestion(
    key: 'post.resolve.dairyLight',
    text: 'If you have a bit of dairy around, it would round this off.',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.dairyLight,
  ),
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.vegRich):
      const CoachQuestion(
    key: 'post.resolve.vegRich',
    text: 'A protein on the side would complete this plate.',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.vegRich,
  ),
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.balanced):
      const CoachQuestion(
    key: 'post.resolve.balanced',
    text: 'Nice plate — anything you would change next time?',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.balanced,
  ),

  // --- open-plate hint (Story 2.2 / 2.3 surfaces) ---
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.vegLight):
      const CoachQuestion(
    key: 'openPlate.vegLight',
    text: 'Greens would round this plate out.',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.vegLight,
  ),
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.proteinHeavy):
      const CoachQuestion(
    key: 'openPlate.proteinHeavy',
    text: 'A handful of greens or veg would lighten this up.',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.proteinHeavy,
  ),
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.starchHeavy):
      const CoachQuestion(
    key: 'openPlate.starchHeavy',
    text: 'Some veg on the side would balance this nicely.',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.starchHeavy,
  ),
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.dairyLight):
      const CoachQuestion(
    key: 'openPlate.dairyLight',
    text: 'A bit of dairy would round this off if you have some.',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.dairyLight,
  ),
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.vegRich):
      const CoachQuestion(
    key: 'openPlate.vegRich',
    text: 'A protein on the side would complete this plate.',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.vegRich,
  ),
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.balanced):
      const CoachQuestion(
    key: 'openPlate.balanced',
    text: 'A calm, varied plate — anything you want to add?',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.balanced,
  ),

  // --- depth follow-up (Story 2.3 lands the surface) ---
  // Reuses the post-resolve calm copy — the key is the reviewable
  // identity, so each depth entry is its own reviewable item; the
  // text mirrors the post-resolve wording so the user sees the same
  // non-judgmental nudge one notch deeper. A future AI rung can
  // replace the depth text behind the same key without changing the
  // core.
  CoachQuestionKey(CoachAnchor.depthFollowUp, CompositionPattern.vegLight):
      const CoachQuestion(
    key: 'depth.followUp.vegLight',
    text: 'A handful of greens would round this plate out.',
    anchor: CoachAnchor.depthFollowUp,
    pattern: CompositionPattern.vegLight,
  ),
  CoachQuestionKey(CoachAnchor.depthFollowUp, CompositionPattern.proteinHeavy):
      const CoachQuestion(
    key: 'depth.followUp.proteinHeavy',
    text: 'A small bowl of greens or roasted veg would lighten this up.',
    anchor: CoachAnchor.depthFollowUp,
    pattern: CompositionPattern.proteinHeavy,
  ),
  CoachQuestionKey(CoachAnchor.depthFollowUp, CompositionPattern.starchHeavy):
      const CoachQuestion(
    key: 'depth.followUp.starchHeavy',
    text: 'Some veg on the side would balance this nicely.',
    anchor: CoachAnchor.depthFollowUp,
    pattern: CompositionPattern.starchHeavy,
  ),
  CoachQuestionKey(CoachAnchor.depthFollowUp, CompositionPattern.dairyLight):
      const CoachQuestion(
    key: 'depth.followUp.dairyLight',
    text: 'If you have a bit of dairy around, it would round this off.',
    anchor: CoachAnchor.depthFollowUp,
    pattern: CompositionPattern.dairyLight,
  ),
  CoachQuestionKey(CoachAnchor.depthFollowUp, CompositionPattern.vegRich):
      const CoachQuestion(
    key: 'depth.followUp.vegRich',
    text: 'A protein on the side would complete this plate.',
    anchor: CoachAnchor.depthFollowUp,
    pattern: CompositionPattern.vegRich,
  ),
  CoachQuestionKey(CoachAnchor.depthFollowUp, CompositionPattern.balanced):
      const CoachQuestion(
    key: 'depth.followUp.balanced',
    text: 'Nice plate — anything you would change next time?',
    anchor: CoachAnchor.depthFollowUp,
    pattern: CompositionPattern.balanced,
  ),
};

/// The map key used by the v1 `en` key store.
///
/// `CoachAnchor` and `CompositionPattern` are both `enum`s, so
/// the pair is immutable and hashable. Equality + `hashCode` use both
/// fields so the same `(anchor, pattern)` pair always lands on the
/// same bucket.
class CoachQuestionKey {
  const CoachQuestionKey(this.anchor, this.pattern);

  final CoachAnchor anchor;
  final CompositionPattern pattern;

  /// The canonical string key for the entry — e.g.
  /// `post.resolve.vegLight`. Matches the `CoachQuestion.key` field.
  String get value => _coachKey(anchor, pattern);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! CoachQuestionKey) return false;
    return other.anchor == anchor && other.pattern == pattern;
  }

  @override
  int get hashCode => Object.hash(anchor, pattern);

  @override
  String toString() => 'CoachQuestionKey($value)';
}

// =====================================================================
// Story 3.2 / 3.3 — AI rung copy (FR6 / FR7 / AD-7).
//
// The v1 coach question key store above owns the question text;
// this section owns the rung copy the Your AI surface renders.
// Every entry is calm, non-judgmental, mono-status-line copy —
// no countdown vocabulary, no "Don't show again" easter eggs, no
// "you failed" framing (FR15 / UX-DR10). The named NDP reviewer
// signs off on this file in one review pass; a future locale
// extension lands here, not in widgets.
//
// Story 3.2 owns the hosted-quota copy; Story 3.3 extends with
// the BYOK copy. The two stories share this single reviewable
// surface so the named reviewer can sign off in one file.
// =====================================================================

/// The hosted-quota copy (Story 3.2 / FR6). The status line on
/// Settings → Your AI uses `freeModelRemaining` when the counter
/// is below the ceiling and `freeModelResetAt` when the user
/// has chosen to wait for the quota to reset; the quota notice
/// on the capture screen uses `noticeShort` and `noticeLong`;
/// the 3-way choice uses `keepLogging`, `bringYourOwnKey`, and
/// `waitForReset`.
class AiRungStrings {
  const AiRungStrings({
    required this.freeModelRemaining,
    required this.freeModelResetAt,
    required this.offlineNoAi,
    required this.noticeShort,
    required this.noticeLong,
    required this.keepLogging,
    required this.bringYourOwnKey,
    required this.waitForReset,
    required this.quotaStatusHeading,
  });

  /// Status line: "free model — N calls left today".
  /// Calm mono copy; never a countdown (FR6).
  final String freeModelRemaining;

  /// Status line: "free model — resets at <human-readable local
  /// time>". Calm mono copy; never a countdown (FR6).
  final String freeModelResetAt;

  /// Status line: "offline (no AI)". Calm mono copy; surfaces
  /// when the user has flipped to the no-AI rung or when the
  /// noop rung is the v1 default (Story 1.8 carry-over).
  final String offlineNoAi;

  /// Short quota notice rendered on the capture screen after a
  /// `QuotaExhausted` returns: "the free quota is done — choose
  /// what you'd like to do". Calm mono copy.
  final String noticeShort;

  /// Long quota notice rendered in Settings → Your AI when the
  /// user opens the rung change surface after a quota exhaustion.
  /// Calm mono copy; the 3-way choice follows immediately after.
  final String noticeLong;

  /// First calm path: "keep logging without AI". No pressure, no
  /// countdown — the rung flips to `AiRungKind.noOp` instantly.
  final String keepLogging;

  /// Second calm path: "bring your own key". Opens the BYOK
  /// entry surface (Story 3.3).
  final String bringYourOwnKey;

  /// Third calm path: "wait for the quota to reset". No
  /// countdown; the status line surfaces the reset timestamp.
  final String waitForReset;

  /// Settings → Your AI heading for the quota status block.
  /// Calm mono copy.
  final String quotaStatusHeading;
}

/// The v1 `en` AI rung strings (Story 3.2). The named NDP
/// reviewer signs off on this single value; the keys are the
/// identity the UI binds to.
///
/// Every entry is calm non-judgmental copy (FR15 / NFR3 / NFR7);
/// none of the entries use countdown vocabulary, restriction
/// framing, or "Don't show again" easter eggs.
const AiRungStrings enAiRungStrings = AiRungStrings(
  freeModelRemaining: 'free model — {N} calls left today',
  freeModelResetAt: 'free model — resets at {time}',
  offlineNoAi: 'offline (no AI)',
  noticeShort: 'the free quota is done — choose what you\'d like to do.',
  noticeLong:
      'The free quota is done for today. The photo still logs '
      'to the no-AI core either way — pick what feels right.',
  keepLogging: 'keep logging without AI',
  bringYourOwnKey: 'bring your own key',
  waitForReset: 'wait for the quota to reset',
  quotaStatusHeading: 'When the free quota runs out',
);

/// The BYOK copy (Story 3.3 / FR7). The Your AI sub-screen reads
/// these for the masked key entry, the Save / Remove affordances,
/// the active-status line, and the previous-rung hint. Calm
/// non-judgmental copy (FR15 / NFR3 / NFR7); no countdown
/// vocabulary, no key-shape preview, no "your key starts with
/// sk-..." toast.
class ByokStrings {
  const ByokStrings({
    required this.title,
    required this.label,
    required this.placeholder,
    required this.save,
    required this.remove,
    required this.statusActive,
    required this.statusMissing,
    required this.statusRejected,
    required this.statusQuotaExhausted,
    required this.previousRungHint,
  });

  /// The Your AI sub-screen title (Settings → Your AI).
  final String title;

  /// The rung label rendered on the Settings list row ("Your AI"
  /// surfaces the rung label as the row title; the row's subtitle
  /// is the status line).
  final String label;

  /// The masked text field placeholder copy. Explains on-device
  /// encryption so the user knows the key is never uploaded (FR7).
  final String placeholder;

  /// The `Save` affordance label.
  final String save;

  /// The `Remove key` affordance label.
  final String remove;

  /// Status line when the BYOK rung is active and a key is stored.
  /// Reads "your key — 1 model" (calm mono copy; FR7 / FR15).
  final String statusActive;

  /// Status line when no key is stored.
  /// Reads "your key — none" (calm mono copy).
  final String statusMissing;

  /// Status line when the provider rejected the key.
  /// Reads "your key — rejected" (calm mono copy; FR7).
  final String statusRejected;

  /// Status line when the provider's quota is exhausted.
  /// Reads "your key — quota done" (calm mono copy; FR6 carry-over).
  final String statusQuotaExhausted;

  /// Hint copy rendered under the BYOK entry form when the
  /// previous rung is recorded. Reads "removing this key returns
  /// to <previous rung label>" (calm non-judgmental; FR7).
  final String previousRungHint;
}

/// The v1 `en` BYOK strings (Story 3.3). The named NDP reviewer
/// signs off on this single value; the keys are the identity the
/// UI binds to.
///
/// Every entry is calm non-judgmental copy (FR15 / NFR3 / NFR7);
/// none of the entries use countdown vocabulary, restriction
/// framing, or key-shape previews.
const ByokStrings enByokStrings = ByokStrings(
  title: 'Your AI',
  label: 'your key',
  placeholder:
      'paste your OpenAI-compatible key — stored encrypted on this device',
  save: 'Save',
  remove: 'Remove key',
  statusActive: 'your key — 1 model',
  statusMissing: 'your key — none',
  statusRejected: 'your key — rejected',
  statusQuotaExhausted: 'your key — quota done',
  previousRungHint: 'removing this key returns to {previousRungLabel}',
);

/// The web session strings (Story 4.1 / AD-8). The lock screen
/// body in `packages/integrations/lib/src/store/lock_screen.dart`
/// reads these for the heading, the placeholder, the unlock
/// affordance, and the calm wrong-passphrase line.
///
/// AD-7: keyed, never interpolated, named NDP reviewer signs off.
/// FR-15: calm non-judgmental copy; no countdown, no
/// "Don't show again" easter egg, no "wrong" judgement framing.
class WebSessionStrings {
  const WebSessionStrings({
    required this.label,
    required this.placeholder,
    required this.unlock,
    required this.wrongPassphrase,
  });

  /// The lock-screen heading. Calm copy; the gate is the first
  /// paint on the web rung, and the heading names the action.
  final String label;

  /// The passphrase field placeholder. Calm non-judgmental copy;
  /// explains on-device sealing.
  final String placeholder;

  /// The unlock pill label. Calm copy; no celebration.
  final String unlock;

  /// The calm wrong-passphrase line. Renders below the pill when
  /// `tryOpen` returns `false`. No exception crosses the port.
  final String wrongPassphrase;
}

/// The v1 `en` web session strings (Story 4.1). The named NDP
/// reviewer signs off on this single value; the keys are the
/// identity the `LockScreenBody` binds to.
const WebSessionStrings enWebSessionStrings = WebSessionStrings(
  label: 'Unlock your store',
  placeholder: 'Passphrase — kept in memory for this session only',
  unlock: 'Unlock',
  wrongPassphrase: 'That passphrase does not open this store.',
);

/// The v1 `en` strings for the Settings → Your data sub-screen
/// (Story 4.1 / AD-8 / FR-9). The named NDP reviewer signs off on
/// this single value; the keys are the identity the `YourDataScreen`
/// binds to.
///
/// The `lockedProtection` line is the AD-8 honest-copy anchor: web
/// protection is described as \"session-sealed, not at-rest
/// encrypted\" — weaker than mobile, never overclaimed.
class YourDataStrings {
  const YourDataStrings({
    required this.title,
    required this.lockedProtection,
    required this.unlockedProtection,
  });

  /// The sub-screen heading. Calm copy; the surface is one calm
  /// list under Settings.
  final String title;

  /// Rendered when the web session is locked. AD-8 honest copy:
  /// \"session-sealed, not at-rest encrypted\". Tells the user the
  /// posture plainly — never asserts \"at-rest\" on web.
  final String lockedProtection;

  /// Rendered when the web session is unlocked or on mobile. The
  /// mobile posture is AES-256 at rest via Keychain/Keystore; the
  /// web posture is session-sealed. Both are stated plainly.
  final String unlockedProtection;
}

const YourDataStrings enYourDataStrings = YourDataStrings(
  title: 'Your data',
  lockedProtection:
      'Session-sealed, not at-rest encrypted — this record is '
      'protected by the passphrase you entered on this device. '
      'Reload the page and it stays sealed.',
  unlockedProtection:
      'Encrypted at rest on mobile (AES-256, Keychain/Keystore); '
      'session-sealed on the web (the key is held in memory for this '
      'session only — never written to disk).',
);

/// The v1 `en` strings for the export affordance (Story 4.2 /
/// AD-9 / FR-9 / NFR10). The named NDP reviewer signs off on
/// this single value; the keys are the identity the Your data
/// sub-screen binds to.
///
/// AD-7: keyed, never interpolated. FR-15: calm non-judgmental
/// copy; no countdown, no celebration, no "Don't show again"
/// easter egg. UX-DR9: the affordance is reversible — the
/// export is a read-only copy, the source is untouched.
class ExportStrings {
  const ExportStrings({
    required this.formatLabel,
    required this.formatCsv,
    required this.formatJson,
    required this.scopeLabel,
    required this.scopeToday,
    required this.scopeWeek,
    required this.scopeAll,
    required this.exportButton,
    required this.exportedLine,
    required this.failedLine,
  });

  final String formatLabel;
  final String formatCsv;
  final String formatJson;
  final String scopeLabel;
  final String scopeToday;
  final String scopeWeek;
  final String scopeAll;
  final String exportButton;

  /// The calm line after a successful export. Renders as
  /// "exported: <file>" with the filename in mono. No card, no
  /// celebration.
  final String exportedLine;

  /// The calm line after a failed export. Renders below the
  /// export pill. No exception is ever thrown across the port.
  final String failedLine;
}

const ExportStrings enExportStrings = ExportStrings(
  formatLabel: 'Format',
  formatCsv: 'CSV',
  formatJson: 'JSON',
  scopeLabel: 'Scope',
  scopeToday: 'Today',
  scopeWeek: 'This week',
  scopeAll: 'All history',
  exportButton: 'Export',
  exportedLine: 'exported: ',
  failedLine: 'export failed — try again',
);