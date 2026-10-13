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
      CoachQuestionKey(
        CoachAnchor.postResolve,
        CompositionPattern.vegLight,
      ): const CoachQuestion(
        key: 'post.resolve.vegLight',
        text: 'A handful of greens would round this plate out.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      ),
      CoachQuestionKey(
        CoachAnchor.postResolve,
        CompositionPattern.proteinHeavy,
      ): const CoachQuestion(
        key: 'post.resolve.proteinHeavy',
        text: 'A small bowl of greens or roasted veg would lighten this up.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.proteinHeavy,
      ),
      CoachQuestionKey(
        CoachAnchor.postResolve,
        CompositionPattern.starchHeavy,
      ): const CoachQuestion(
        key: 'post.resolve.starchHeavy',
        text: 'Some veg on the side would balance this nicely.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.starchHeavy,
      ),
      CoachQuestionKey(
        CoachAnchor.postResolve,
        CompositionPattern.dairyLight,
      ): const CoachQuestion(
        key: 'post.resolve.dairyLight',
        text: 'If you have a bit of dairy around, it would round this off.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.dairyLight,
      ),
      CoachQuestionKey(
        CoachAnchor.postResolve,
        CompositionPattern.vegRich,
      ): const CoachQuestion(
        key: 'post.resolve.vegRich',
        text: 'A protein on the side would complete this plate.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegRich,
      ),
      CoachQuestionKey(
        CoachAnchor.postResolve,
        CompositionPattern.balanced,
      ): const CoachQuestion(
        key: 'post.resolve.balanced',
        text: 'Nice plate — anything you would change next time?',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.balanced,
      ),

      // --- open-plate hint (Story 2.2 / 2.3 surfaces) ---
      CoachQuestionKey(
        CoachAnchor.openPlate,
        CompositionPattern.vegLight,
      ): const CoachQuestion(
        key: 'openPlate.vegLight',
        text: 'Greens would round this plate out.',
        anchor: CoachAnchor.openPlate,
        pattern: CompositionPattern.vegLight,
      ),
      CoachQuestionKey(
        CoachAnchor.openPlate,
        CompositionPattern.proteinHeavy,
      ): const CoachQuestion(
        key: 'openPlate.proteinHeavy',
        text: 'A handful of greens or veg would lighten this up.',
        anchor: CoachAnchor.openPlate,
        pattern: CompositionPattern.proteinHeavy,
      ),
      CoachQuestionKey(
        CoachAnchor.openPlate,
        CompositionPattern.starchHeavy,
      ): const CoachQuestion(
        key: 'openPlate.starchHeavy',
        text: 'Some veg on the side would balance this nicely.',
        anchor: CoachAnchor.openPlate,
        pattern: CompositionPattern.starchHeavy,
      ),
      CoachQuestionKey(
        CoachAnchor.openPlate,
        CompositionPattern.dairyLight,
      ): const CoachQuestion(
        key: 'openPlate.dairyLight',
        text: 'A bit of dairy would round this off if you have some.',
        anchor: CoachAnchor.openPlate,
        pattern: CompositionPattern.dairyLight,
      ),
      CoachQuestionKey(
        CoachAnchor.openPlate,
        CompositionPattern.vegRich,
      ): const CoachQuestion(
        key: 'openPlate.vegRich',
        text: 'A protein on the side would complete this plate.',
        anchor: CoachAnchor.openPlate,
        pattern: CompositionPattern.vegRich,
      ),
      CoachQuestionKey(
        CoachAnchor.openPlate,
        CompositionPattern.balanced,
      ): const CoachQuestion(
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
      CoachQuestionKey(
        CoachAnchor.depthFollowUp,
        CompositionPattern.vegLight,
      ): const CoachQuestion(
        key: 'depth.followUp.vegLight',
        text: 'A handful of greens would round this plate out.',
        anchor: CoachAnchor.depthFollowUp,
        pattern: CompositionPattern.vegLight,
      ),
      CoachQuestionKey(
        CoachAnchor.depthFollowUp,
        CompositionPattern.proteinHeavy,
      ): const CoachQuestion(
        key: 'depth.followUp.proteinHeavy',
        text: 'A small bowl of greens or roasted veg would lighten this up.',
        anchor: CoachAnchor.depthFollowUp,
        pattern: CompositionPattern.proteinHeavy,
      ),
      CoachQuestionKey(
        CoachAnchor.depthFollowUp,
        CompositionPattern.starchHeavy,
      ): const CoachQuestion(
        key: 'depth.followUp.starchHeavy',
        text: 'Some veg on the side would balance this nicely.',
        anchor: CoachAnchor.depthFollowUp,
        pattern: CompositionPattern.starchHeavy,
      ),
      CoachQuestionKey(
        CoachAnchor.depthFollowUp,
        CompositionPattern.dairyLight,
      ): const CoachQuestion(
        key: 'depth.followUp.dairyLight',
        text: 'If you have a bit of dairy around, it would round this off.',
        anchor: CoachAnchor.depthFollowUp,
        pattern: CompositionPattern.dairyLight,
      ),
      CoachQuestionKey(
        CoachAnchor.depthFollowUp,
        CompositionPattern.vegRich,
      ): const CoachQuestion(
        key: 'depth.followUp.vegRich',
        text: 'A protein on the side would complete this plate.',
        anchor: CoachAnchor.depthFollowUp,
        pattern: CompositionPattern.vegRich,
      ),
      CoachQuestionKey(
        CoachAnchor.depthFollowUp,
        CompositionPattern.balanced,
      ): const CoachQuestion(
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
    required this.manualFallbackHint,
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

  /// Calm subtitle under a quota / failure notice: logging still works
  /// through the closest matches or manual entry.
  final String manualFallbackHint;
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
  manualFallbackHint: 'You can still pick a closest match or type it manually.',
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
  /// to `previous rung label`" (calm non-judgmental; FR7).
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

/// The web store strings (Story 4.1 / AD-8, extended in Phase 2B): the
/// unlock screen, the first-run create-passphrase screen, the lock
/// affordances and the forgotten-passphrase path.
///
/// AD-7: keyed, never interpolated, named NDP reviewer signs off.
/// FR-15: calm non-judgmental copy; no countdown (the throttle line gives
/// no number), no pressure, no "wrong" judgement framing. The one hard fact
/// -- a forgotten passphrase cannot be recovered -- is stated plainly, once
/// before the passphrase is set and once on the forgot path.
class WebSessionStrings {
  const WebSessionStrings({
    required this.label,
    required this.placeholder,
    required this.unlock,
    required this.wrongPassphrase,
    required this.unavailable,
    required this.throttled,
    required this.inOtherTab,
    required this.newerVersion,
    required this.forgot,
    required this.forgotBody,
    required this.forgotAction,
    required this.createTitle,
    required this.createExplain,
    required this.createWarning,
    required this.createPassphraseLabel,
    required this.createConfirmLabel,
    required this.createAction,
    required this.tooShort,
    required this.tooRepetitive,
    required this.mismatch,
    required this.lockAction,
    required this.lockAfterLabel,
    required this.lockAfterOptions,
  });

  /// The lock-screen heading. Calm copy; the gate is the first
  /// paint on the web rung, and the heading names the action.
  final String label;

  /// The passphrase field placeholder.
  final String placeholder;

  /// The unlock pill label. Calm copy; no celebration.
  final String unlock;

  /// The calm wrong-passphrase line. Renders below the pill when the
  /// passphrase does not open the store. No exception crosses the port.
  final String wrongPassphrase;

  /// Honest line when the browser cannot open the store at all (storage
  /// blocked, no secure context, wasm missing) — distinct from a wrong
  /// passphrase.
  final String unavailable;

  /// Shown instead of an attempt after repeated wrong passphrases. UX
  /// friction only; deliberately carries no number.
  final String throttled;

  /// Another tab holds the store open; the user can try again after closing
  /// or locking it there.
  final String inOtherTab;

  /// The stored data was written by a newer version than this tab runs (an
  /// older cached build); reloading updates it. Calm, no blame, nothing lost.
  final String newerVersion;

  /// The "forgot passphrase" disclosure label.
  final String forgot;

  /// What a forgotten passphrase means (unrecoverable) and the one option.
  final String forgotBody;

  /// The erase-and-start-over action label.
  final String forgotAction;

  /// First-run heading.
  final String createTitle;

  /// What the passphrase protects and when it is asked for.
  final String createExplain;

  /// The unrecoverability warning shown before the passphrase is set.
  final String createWarning;

  final String createPassphraseLabel;
  final String createConfirmLabel;
  final String createAction;

  /// New passphrase shorter than the minimum.
  final String tooShort;

  /// New passphrase with too few distinct characters.
  final String tooRepetitive;

  /// Confirmation does not match.
  final String mismatch;

  /// The manual lock action label.
  final String lockAction;

  /// Label of the auto-lock delay choice.
  final String lockAfterLabel;

  /// Labels of the auto-lock delay choices (5 / 15 / 30 / 60 minutes, in
  /// that order).
  final List<String> lockAfterOptions;
}

/// The v1 `en` web store strings. The named NDP reviewer signs off on this
/// single value; the keys are the identity the lock / create widgets bind
/// to.
const WebSessionStrings enWebSessionStrings = WebSessionStrings(
  label: 'Unlock your store',
  placeholder: 'Passphrase',
  unlock: 'Unlock',
  wrongPassphrase: 'That passphrase does not open this store.',
  unavailable:
      "This browser can't open the protected store. It needs a secure "
      '(https or localhost) page with site storage allowed. Reload to try '
      'again.',
  throttled: 'Please wait a moment before trying again.',
  inOtherTab:
      'AI Nutrition Coach is open in another tab. Lock or close it there, then try '
      'again here.',
  newerVersion:
      'This data was opened by a newer version of AI Nutrition Coach. Nothing is '
      'lost: reload the page to update, then unlock again.',
  forgot: 'Forgot your passphrase?',
  forgotBody:
      'It cannot be recovered: your history is encrypted with a key made '
      'from your passphrase, and nobody else has a copy. You can erase '
      'it and start over.',
  forgotAction: 'Erase and start over',
  createTitle: 'Protect your history',
  createExplain:
      'Choose a passphrase. It encrypts everything AI Nutrition Coach saves in this '
      'browser, and you enter it each time you open the app.',
  createWarning:
      'If you forget it, your data cannot be recovered — not by us, not by '
      'anyone. There is no reset link.',
  createPassphraseLabel: 'Passphrase',
  createConfirmLabel: 'Confirm passphrase',
  createAction: 'Create and unlock',
  tooShort: 'Use at least 10 characters.',
  tooRepetitive: 'Use a few different characters.',
  mismatch: "The two passphrases don't match.",
  lockAction: 'Lock',
  lockAfterLabel: 'Lock automatically after',
  lockAfterOptions: ['5 minutes', '15 minutes', '30 minutes', '1 hour'],
);

/// Copy for a web store whose header cannot be read or whose data is gone
/// (Phase 2B). Same single action as the lost-key surface: erase and start
/// over.
const KeyLostStrings enWebStoreUnreadableStrings = KeyLostStrings(
  title: "Your saved history can't be found",
  body:
      'The protected store in this browser is incomplete or unreadable — '
      'for example after clearing site data. Reloading sometimes fixes it. '
      'If it does not, you can erase what is left and start over.',
  action: 'Erase local data and start over',
);

/// The v1 `en` strings for the Settings → Your data sub-screen
/// (Story 4.1 / AD-8 / FR-9). The named NDP reviewer signs off on
/// this single value; the keys are the identity the `YourDataScreen`
/// binds to.
///
/// The protection lines are the AD-8 honest-copy anchor: the cipher is
/// named truthfully, and the web key-handling difference (passphrase, not
/// keystore; unrecoverable) is stated plainly, never overclaimed.
class YourDataStrings {
  const YourDataStrings({
    required this.title,
    required this.lockedProtection,
    required this.unlockedProtection,
    required this.eraseLabel,
    required this.eraseExplain,
    required this.eraseButton,
    required this.eraseConfirmTitle,
    required this.eraseConfirmBody,
    required this.eraseConfirmAction,
    required this.eraseCancel,
    required this.eraseDone,
    required this.eraseFailed,
  });

  /// The sub-screen heading. Calm copy; the surface is one calm
  /// list under Settings.
  final String title;

  /// Rendered when the web store is locked. AD-8 honest copy: encrypted
  /// at rest in the browser, key derived from the passphrase.
  final String lockedProtection;

  /// Rendered when the web store is unlocked or on mobile. Both are
  /// ChaCha20-Poly1305 at rest (AD-8 / D4 — the cipher is named
  /// truthfully, never "AES-256"); the key source differs (Keychain/
  /// Keystore vs passphrase) and is stated plainly.
  final String unlockedProtection;

  /// Section label for the erase affordance (Phase 2A / D8).
  final String eraseLabel;

  /// One calm sentence on what erasing does and that it cannot be
  /// undone. No scare language.
  final String eraseExplain;

  /// The erase pill label.
  final String eraseButton;

  /// Confirmation dialog title.
  final String eraseConfirmTitle;

  /// Confirmation dialog body: lists what goes, says export first.
  final String eraseConfirmBody;

  /// Confirmation dialog destructive action label.
  final String eraseConfirmAction;

  /// Confirmation dialog dismiss label — the safe choice.
  final String eraseCancel;

  /// Shown after a successful erase. The app must be reopened.
  final String eraseDone;

  /// Shown when at least one erase step failed; honest, no cause text.
  final String eraseFailed;
}

const YourDataStrings enYourDataStrings = YourDataStrings(
  title: 'Your data',
  lockedProtection:
      'Encrypted at rest in this browser (ChaCha20-Poly1305). The key is '
      'made from your passphrase and is never stored, so nothing here can '
      'be read until you unlock it.',
  unlockedProtection:
      'Encrypted at rest (ChaCha20-Poly1305). On mobile the key is held in '
      'the Keychain/Keystore, stays on this device and is not included in '
      'backups. On the web the key is made from your passphrase, held in '
      'memory only while unlocked and never stored — if you forget the '
      'passphrase, the data cannot be recovered. Your AI key and settings '
      'are kept inside the same encrypted store.',
  eraseLabel: 'Erase local data',
  eraseExplain:
      'Removes your history, coach notes, saved AI key and any exports '
      'still on this device. Copies you shared or downloaded elsewhere are '
      'not affected. There is no other copy of your data, so this cannot '
      'be undone — export first if you want to keep one.',
  eraseButton: 'Erase all local data',
  eraseConfirmTitle: 'Erase everything on this device?',
  eraseConfirmBody:
      'Your plates, coach notes, saved AI key and exports still on this '
      'device will be deleted for good. Copies you shared or downloaded '
      'elsewhere are not affected.',
  eraseConfirmAction: 'Erase',
  eraseCancel: 'Keep my data',
  eraseDone:
      'All local data was erased. Close and reopen AI Nutrition Coach to start '
      'fresh.',
  eraseFailed:
      'Some data could not be erased. Please try again, or clear the '
      "app's storage in your device settings.",
);

/// The v1 `en` strings for the "history can't be opened" surface shown
/// when the database exists but its key is gone (Phase 2A / D7 / D8).
///
/// Calm and factual; it never blames the user, never shows a stack, and
/// offers exactly one way forward — the explicit erase. The named NDP
/// reviewer signs off on this single value.
class KeyLostStrings {
  const KeyLostStrings({
    required this.title,
    required this.body,
    required this.action,
  });

  /// Heading of the surface.
  final String title;

  /// Why the history cannot be opened and what the only option is.
  final String body;

  /// The single action: erase and start over.
  final String action;
}

const KeyLostStrings enKeyLostStrings = KeyLostStrings(
  title: "Your history can't be opened",
  body:
      'This device no longer has the key that protects your saved '
      'history, so it cannot be read. This can happen after restoring '
      'from a backup or resetting the device. You can erase the unreadable '
      'data and start over.',
  action: 'Erase local data and start over',
);

/// Copy for every OTHER startup failure (Phase 2A review 2): the protected
/// store could not be opened for a reason other than a lost key — e.g. a
/// keystore error or a legacy file that could not be upgraded. Same
/// single action, but the body is honest that closing and reopening may
/// help first, because erasing is permanent.
const KeyLostStrings enStoreOpenFailedStrings = KeyLostStrings(
  title: "Your history can't be opened right now",
  body:
      'The protected store on this device could not be opened. Closing and '
      'reopening AI Nutrition Coach sometimes fixes this. If it keeps happening, '
      'you can erase the unreadable data and start over — this removes '
      'everything saved on this device.',
  action: 'Erase local data and start over',
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
    required this.plaintextNote,
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
  /// "exported: `file`" with the filename in mono. No card, no
  /// celebration.
  final String exportedLine;

  /// The calm line after a failed export. Renders below the
  /// export pill. No exception is ever thrown across the port.
  final String failedLine;

  /// One calm line under the export button: exports are plain text files
  /// (PV8).
  final String plaintextNote;
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
  plaintextNote:
      'Exports are plain, unencrypted files: keep them somewhere you trust.',
);

/// The v1 `en` strings for the sync-queue chip surface
/// (Story 4.3 / AD-6 / FR-10 / UX-DR6). The chip is the only
/// user-facing surface the sync queue owns — calm non-judgmental
/// copy; no spinner, no countdown, no red-guilt state (FR-15).
///
/// The named NDP reviewer signs off this single value; the keys
/// are the identity the chip widget binds to.
class SyncQueueStrings {
  const SyncQueueStrings({
    required this.localChip,
    required this.pendingChip,
    required this.syncedChip,
    required this.failedChip,
  });

  /// The default chip state, and the ONLY one while there is no sync
  /// transport (v1): the plate is saved on this device and nowhere else.
  /// Rendered as `· on this device` in mono.
  final String localChip;

  /// The op is enqueued but the durable remote ack has not landed.
  /// Rendered as `· pending` in mono.
  final String pendingChip;

  /// The durable remote ack landed (only possible once a transport
  /// exists). Rendered as `· synced` with the sage-tint wash.
  final String syncedChip;

  /// The transport returned a permanent failure. The chip never
  /// uses a red-guilt state (FR-15 / NFR3); the failed chip is the
  /// same mono voice as `pending` / `synced`.
  final String failedChip;
}

const SyncQueueStrings enSyncQueueStrings = SyncQueueStrings(
  localChip: 'on this device',
  pendingChip: 'pending',
  syncedChip: 'synced',
  failedChip: 'retry later',
);

/// The v1 `en` strings for the managed-oversight v2 seam notice
/// (Story 5.2 / FR-14 / OQ-4). The Settings → About sub-screen
/// renders a single calm line that says "Family oversight is a v2
/// seam — not in v1" so the v1 surface doesn't imply the v2 feature
/// exists (AD-7 / FR-15).
///
/// The named NDP reviewer signs off this single value; the keys
/// are the identity the `AboutScreen` binds to.
class ManagedOversightStrings {
  const ManagedOversightStrings({required this.v2Notice});

  /// The single calm line that surfaces in Settings → About.
  /// Plain "not in v1" framing — never "coming soon", never a
  /// countdown (FR-15 ban list).
  final String v2Notice;
}

const ManagedOversightStrings enManagedOversightStrings =
    ManagedOversightStrings(
      v2Notice:
          'Family oversight is a v2 seam — not in v1. Read-only, '
          'support-not-surveillance, pending COPPA review.',
    );

// =====================================================================
// Phase 3 — Settings navigation, Your AI screen, photo consent.
//
// AD-7: keyed, never built from fragments in widgets (the only
// interpolation is the documented `{host}` / `{last4}` / `{status}`
// placeholders, replaced verbatim). Calm and non-judgmental (FR-15): no
// warnings in red, no "you must", no pressure to turn AI on.
// =====================================================================

/// The Settings list (reachable from the Day Board's app-bar action).
class SettingsStrings {
  const SettingsStrings({
    required this.title,
    required this.openSettings,
    required this.yourAi,
    required this.yourData,
    required this.about,
    required this.yourAiNone,
    required this.yourAiByok,
    required this.yourDataSubtitle,
    required this.aboutSubtitle,
  });

  final String title;

  /// Accessible label of the Day Board's Settings action.
  final String openSettings;
  final String yourAi;
  final String yourData;
  final String about;

  /// Subtitle of the Your AI row when no AI is on.
  final String yourAiNone;

  /// Subtitle of the Your AI row when the user's own key is on.
  final String yourAiByok;
  final String yourDataSubtitle;
  final String aboutSubtitle;
}

const SettingsStrings enSettingsStrings = SettingsStrings(
  title: 'Settings',
  openSettings: 'Settings',
  yourAi: 'Your AI',
  yourData: 'Your data',
  about: 'About',
  yourAiNone: 'offline (no AI)',
  yourAiByok: 'your key',
  yourDataSubtitle: 'export · lock · erase',
  aboutSubtitle: 'yours to run · open source',
);

/// The Your AI screen (Settings → Your AI).
class YourAiStrings {
  const YourAiStrings({
    required this.title,
    required this.intro,
    required this.rungHeading,
    required this.rungNoneLabel,
    required this.rungNoneHelp,
    required this.rungByokLabel,
    required this.rungByokHelp,
    required this.rungHostedLabel,
    required this.rungLocalLabel,
    required this.rungUnavailable,
    required this.byokHeading,
    required this.endpointLabel,
    required this.endpointHint,
    required this.endpointHelp,
    required this.endpointEmpty,
    required this.endpointNotAUrl,
    required this.endpointNotHttps,
    required this.endpointHasCredentials,
    required this.endpointHasQuery,
    required this.modelLabel,
    required this.modelHint,
    required this.modelEmpty,
    required this.keyLabel,
    required this.keyHint,
    required this.keyHelp,
    required this.keyHelpWeb,
    required this.keySavedTemplate,
    required this.keySavedPlain,
    required this.keyNone,
    required this.keyReplaceHint,
    required this.save,
    required this.removeKey,
    required this.saved,
    required this.keyRemoved,
    required this.keyInvalid,
    required this.testConnection,
    required this.testing,
    required this.testOk,
    required this.testKeyRejected,
    required this.testRateLimited,
    required this.testTimeout,
    required this.testNetwork,
    required this.testUnexpected,
    required this.testNotConfigured,
    required this.testTooLarge,
    required this.testKeyOtherHost,
    required this.keyOtherHost,
    required this.privacyHeading,
    required this.consentNone,
    required this.consentExplainer,
    required this.consentRevoke,
    required this.docsHint,
    required this.askEveryPhotoLabel,
    required this.askEveryPhotoHelp,
  });

  final String title;
  final String intro;
  final String rungHeading;
  final String rungNoneLabel;
  final String rungNoneHelp;
  final String rungByokLabel;
  final String rungByokHelp;
  final String rungHostedLabel;
  final String rungLocalLabel;

  /// Shown under rungs that exist in the design but not in this build.
  final String rungUnavailable;
  final String byokHeading;
  final String endpointLabel;
  final String endpointHint;
  final String endpointHelp;
  final String endpointEmpty;
  final String endpointNotAUrl;
  final String endpointNotHttps;
  final String endpointHasCredentials;
  final String endpointHasQuery;
  final String modelLabel;
  final String modelHint;
  final String modelEmpty;
  final String keyLabel;
  final String keyHint;

  /// Mobile: where the key is kept.
  final String keyHelp;

  /// Web: the key is kept in the encrypted store (S4, ADR-0003).
  final String keyHelpWeb;

  /// `key saved • ends with ••••{last4}` — never more than the last four.
  final String keySavedTemplate;

  /// Used when the key is too short for a safe hint.
  final String keySavedPlain;
  final String keyNone;
  final String keyReplaceHint;
  final String save;
  final String removeKey;
  final String saved;
  final String keyRemoved;
  final String keyInvalid;
  final String testConnection;
  final String testing;
  final String testOk;
  final String testKeyRejected;
  final String testRateLimited;
  final String testTimeout;
  final String testNetwork;

  /// `{status}` is the HTTP status code.
  final String testUnexpected;
  final String testNotConfigured;
  final String testTooLarge;

  /// The saved key belongs to another endpoint than the one being tested.
  final String testKeyOtherHost;

  /// Saving a new endpoint without re-entering the key; `{host}` is the
  /// host the saved key was entered for.
  final String keyOtherHost;
  final String privacyHeading;
  final String consentNone;
  final String consentExplainer;
  final String consentRevoke;

  /// The link to the in-app privacy page.
  final String docsHint;

  /// The "Ask before every photo upload" switch (PV1).
  final String askEveryPhotoLabel;
  final String askEveryPhotoHelp;
}

const YourAiStrings enYourAiStrings = YourAiStrings(
  title: 'Your AI',
  intro:
      'AI Nutrition Coach works fully without AI. If you like, you can let a service '
      'you choose suggest foods from a photo — with your own key, your call.',
  rungHeading: 'Recognising a photo',
  rungNoneLabel: 'No AI',
  rungNoneHelp: 'Photos stay on this device. You pick a match or type it.',
  rungByokLabel: 'My own key',
  rungByokHelp: 'Photos go to the service you set below, using your key.',
  rungHostedLabel: 'Free hosted model',
  rungLocalLabel: 'Model on this device',
  rungUnavailable: 'Not available yet',
  byokHeading: 'Your service',
  endpointLabel: 'Endpoint',
  endpointHint: 'https://openrouter.ai/api/v1',
  endpointHelp:
      'Starts with https://. A model running on this device may use '
      'http://localhost.',
  endpointEmpty: 'Add the address of your service.',
  endpointNotAUrl: "That doesn't look like a web address.",
  endpointNotHttps: 'Use https:// — plain http:// works only for localhost.',
  endpointHasCredentials: 'Leave the username and password out of the address.',
  endpointHasQuery: 'Leave anything after "?" or "#" out of the address.',
  modelLabel: 'Model',
  modelHint: 'e.g. google/gemini-2.0-flash-exp:free',
  modelEmpty: 'Add the model name your service offers.',
  keyLabel: 'API key',
  keyHint: 'Paste your key',
  keyHelp:
      'Kept encrypted on this device. It is sent only to the endpoint above '
      'and is never shown again.',
  keyHelpWeb:
      'Kept encrypted in this browser, with your data — it can be read only '
      'after you unlock. It is sent only to the endpoint above and is never '
      'shown again.',
  keySavedTemplate: 'key saved • ends with ••••{last4}',
  keySavedPlain: 'key saved',
  keyNone: 'no key saved',
  keyReplaceHint: 'Paste a new key to replace it.',
  save: 'Save',
  removeKey: 'Remove key',
  saved: 'Saved.',
  keyRemoved: 'Key removed.',
  keyInvalid: 'That key has spaces or line breaks in it — paste it again.',
  testConnection: 'Test connection',
  testing: 'Checking…',
  testOk: 'Connected — the endpoint, model and key work.',
  testKeyRejected: "The service didn't accept this key.",
  testRateLimited: 'The service asks to slow down. Try again a little later.',
  testTimeout: "The service didn't answer in time.",
  testNetwork: "Couldn't reach the service.",
  testUnexpected: 'The service answered with an unexpected status ({status}).',
  testNotConfigured: 'Add an endpoint, a model and a key first.',
  testTooLarge:
      'The service sent back far more than expected, so it was stopped.',
  testKeyOtherHost:
      'The saved key was entered for a different service. Paste the key for '
      'this one to test it.',
  keyOtherHost:
      'The saved key was entered for {host}, so it is not sent anywhere '
      'else. Paste the key for this endpoint to save it.',
  privacyHeading: 'Photos and consent',
  consentNone: "You haven't allowed any service to receive photos.",
  consentExplainer:
      'Before a photo is sent you are asked first. Photos are shrunk and '
      'stripped of location and camera details first.',
  consentRevoke: 'Revoke',
  docsHint: 'What this app stores and sends',
  askEveryPhotoLabel: 'Ask before every photo upload',
  askEveryPhotoHelp:
      'On: each photo needs its own yes. Off: you say yes once per service '
      'and photos then go without asking, until you revoke it below.',
);

/// The "send this photo to this host?" dialog (N1, PV1, PV2).
///
/// Shown before the FIRST photo goes to a given third-party host (the BYOK
/// endpoint's host), and before EVERY photo while "Ask before every photo
/// upload" is on (the default). Every sentence is literal about what leaves
/// the device; nothing here is a promise about what the host does with it.
class PhotoConsentStrings {
  const PhotoConsentStrings({
    required this.title,
    required this.whatIsSent,
    required this.alsoVisible,
    required this.alsoVisibleWeb,
    required this.retention,
    required this.notSent,
    required this.revokeHint,
    required this.askEveryHint,
    required this.allow,
    required this.allowOnce,
    required this.decline,
    required this.learnMore,
  });

  /// `{host}` is the endpoint host, named verbatim.
  final String title;

  /// The photo, the fixed instruction and the model name.
  final String whatIsSent;

  /// What the host also sees on any request. `{host}` is the endpoint host.
  final String alsoVisible;

  /// Same, on the web build: the page's origin travels too (`Origin`).
  final String alsoVisibleWeb;

  /// The host may keep requests under its own policy. `{host}` is the host.
  final String retention;

  /// What is NOT sent.
  final String notSent;

  /// Where to change the per-host agreement (the "ask once" mode).
  final String revokeHint;

  /// Shown instead of [revokeHint] while "ask before every photo" is on.
  final String askEveryHint;

  /// "Allow this host from now on" label. `{host}` is the endpoint host.
  final String allow;

  /// "Send this photo" label (one photo only).
  final String allowOnce;
  final String decline;

  /// The link to the in-app privacy page (never an external URL).
  final String learnMore;
}

const PhotoConsentStrings enPhotoConsentStrings = PhotoConsentStrings(
  title: 'Send this photo to {host}?',
  whatIsSent:
      'What is sent: the photo, shrunk, with its location and camera '
      'details removed, a fixed instruction asking which foods are on the '
      'plate, and the model name you chose. AI Nutrition Coach does not run that '
      'service and never sees the photo.',
  alsoVisible:
      'Also visible to {host}: your internet address and your device or '
      'app type, as with any website.',
  alsoVisibleWeb:
      'Also visible to {host}: your internet address, your browser type '
      'and the address of this site, as with any website.',
  retention:
      '{host} may keep requests under its own terms: check your '
      "provider's data policy.",
  notSent: 'Not sent: your name, your history, or your other plates.',
  revokeHint: 'You can change this any time in Settings → Your AI.',
  askEveryHint:
      'You are asked before every photo. Change this in Settings → Your AI.',
  allow: 'Allow {host}',
  allowOnce: 'Send this photo',
  decline: 'Not now',
  learnMore: 'What this app stores and sends',
);

/// The v1 `en` strings for the Day Board's meal slots (keyed copy, AD-7).
///
/// `lateOther` is ONE slot for 23:00-04:59, ordered by time of day inside it
/// (00:00-04:59 plates come before the 23:xx ones, because a day runs
/// 00:00 -> 23:59). It is shown only when it holds a plate.
class DayBoardStrings {
  const DayBoardStrings({
    required this.breakfast,
    required this.lunch,
    required this.dinner,
    required this.lateOther,
  });

  final String breakfast;
  final String lunch;
  final String dinner;
  final String lateOther;
}

const DayBoardStrings enDayBoardStrings = DayBoardStrings(
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  lateOther: 'Late / other',
);
