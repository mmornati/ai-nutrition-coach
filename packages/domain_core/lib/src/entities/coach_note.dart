// A persisted coach note — one per post-resolve whisper (FR4 / FR9 / AD-3).
//
// Coach notes are the durable record of the whisper that lands on a just-logged
// plate. The whisper itself is the (immutable) question text the active `Coach`
// rung resolved for the `(anchor, pattern)` pair at commit time; the note
// captures `id`, `plateLogId`, the anchor that fired it, the resolved key
// from the localized store, the verbatim text, and the moment the question
// was generated.
//
// Equality is by `id` alone — once a note is in the store it is the same
// record. `hashCode` matches: two notes with the same `id` always compare
// equal and always hash the same. The `copyWith` helper rebuilds the
// record immutably; the new instance keeps the same `id` when the caller
// does not override it.
//
// The entity is pure-Dart. No Flutter / drift / dio / mobile_scanner /
// image_picker / dart:io imports. The AD-1 grep test in
// `packages/domain_core/test/domain_core_test.dart` pins the rule.

import '../value_types/composition_pattern.dart';

class CoachNote {
  const CoachNote({
    required this.id,
    required this.plateLogId,
    required this.anchor,
    required this.questionKey,
    required this.text,
    required this.generatedAt,
  });

  /// The autoincrement id the store assigned at write time. `0` is
  /// reserved for a not-yet-persisted note constructed in-memory before
  /// the store round-trip; the adapter overwrites it with the real
  /// value inside `append`.
  final int id;

  /// The `PlateLog.id` this note is anchored to. Foreign key at the
  /// database level (the `coach_notes.plate_log_id` column) and at the
  /// domain level (the `forPlate(plateLogId)` read selector).
  final int plateLogId;

  /// The surface that fired the question. v1 ships two anchors
  /// (`postResolve`, `openPlate`); Story 2.2 writes the post-resolve
  /// anchor, Story 2.3 owns the open-plate surface and the answer /
  /// dismiss / depth interaction log.
  final CoachAnchor anchor;

  /// The reviewable key the named NDP reviewer signs off on in
  /// `packages/integrations/lib/src/l10n/coach_strings.dart`. Same
  /// `key` = same question; the UI dedupes on this field alone.
  final String questionKey;

  /// The localized, calm, non-judgmental copy string the whisper
  /// renders. Plain text only — no decorative unicode, no color
  /// tokens, no typography references (NFR7). The key store invariant
  /// is "≥1 char, calm, non-judgmental"; this field is the verbatim
  /// copy resolved at write time.
  final String text;

  /// The UTC moment the note was generated. Stored as the
  /// authoritative instant; the UI renders local. Mirrors the
  /// `PlateLog.loggedAtUtc` convention — never a local clock.
  final DateTime generatedAt;

  CoachNote copyWith({
    int? id,
    int? plateLogId,
    CoachAnchor? anchor,
    String? questionKey,
    String? text,
    DateTime? generatedAt,
  }) {
    return CoachNote(
      id: id ?? this.id,
      plateLogId: plateLogId ?? this.plateLogId,
      anchor: anchor ?? this.anchor,
      questionKey: questionKey ?? this.questionKey,
      text: text ?? this.text,
      generatedAt: generatedAt ?? this.generatedAt,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! CoachNote) return false;
    return other.id == id;
  }

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() =>
      'CoachNote(id: $id, plateLogId: $plateLogId, anchor: $anchor, '
      'questionKey: "$questionKey", text: "$text", generatedAt: $generatedAt)';
}
