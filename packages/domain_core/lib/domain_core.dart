/// Pure-Dart domain core for AI Nutrition Coach.
///
/// This package owns entities, use-cases, and ports (the hexagonal core).
/// It must remain free of any I/O, persistence, or UI dependency:
///
/// * No `package:flutter*`
/// * No `package:drift*` / SQLite
/// * No `package:dio` / HTTP
/// * No `package:mobile_scanner*`
/// * No `package:flutter_secure_storage*` (Story 3.1 / AD-1)
///
/// The invariant is enforced two ways:
/// 1. `analysis_options.yaml` runs the analyzer in pure-Dart mode.
/// 2. `test/domain_core_test.dart` greps `lib/**.dart` for forbidden imports
///    so the rule is checked by `dart test`, not just the analyzer.
///
/// Stories 1.2+ populate this surface (PlateLog, FoodEntry, ports, use-cases).
library;

export 'src/entities/byok_previous_rung.dart';
export 'src/entities/coach_note.dart';
export 'src/entities/coach_question.dart';
export 'src/entities/database_food.dart';
export 'src/entities/food_entry.dart';
export 'src/entities/plate_log.dart';
export 'src/entities/sync_op.dart';
export 'src/entities/sync_queue_state.dart';
export 'src/ports/ai_rung.dart';
export 'src/ports/coach.dart';
export 'src/ports/coach_note_store.dart';
export 'src/ports/encrypted_store.dart';
export 'src/ports/exporter.dart';
export 'src/ports/food_catalog.dart';
export 'src/ports/local_data_eraser.dart';
export 'src/ports/sync_adapter.dart';
export 'src/ports/sync_queue.dart';
export 'src/ports/voice_transcriber.dart';
export 'src/results/catalog_failure.dart';
export 'src/results/coach_interaction_failure.dart';
export 'src/results/coach_note_failure.dart';
export 'src/results/coach_question_result.dart';
export 'src/results/erase_failure.dart';
export 'src/results/export_failure.dart';
export 'src/results/recognition_failure.dart';
export 'src/results/store_failure.dart';
export 'src/results/sync_failure.dart';
export 'src/use_cases/erase_local_data.dart';
export 'src/use_cases/generate_coach_note.dart';
export 'src/use_cases/record_byok_change.dart';
export 'src/use_cases/record_byok_change_ports.dart';
export 'src/use_cases/record_coach_interaction.dart';
export 'src/use_cases/record_plate.dart';
export 'src/use_cases/record_sync_op.dart';
export 'src/value_types/ai_rung_config.dart';
export 'src/value_types/ai_rung_kind.dart';
export 'src/value_types/coach_interaction.dart';
export 'src/value_types/managed_oversight_seam.dart';
export 'src/value_types/composition_pattern.dart';
export 'src/value_types/export_format.dart';
export 'src/value_types/export_scope.dart';
export 'src/value_types/food_entry_draft.dart';
export 'src/value_types/quantity_range.dart';
export 'src/value_types/recognized_food.dart';

const String domainCoreVersion = '0.1.0';
