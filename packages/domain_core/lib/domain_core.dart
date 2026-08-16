/// Pure-Dart domain core for OpenPlate.
///
/// This package owns entities, use-cases, and ports (the hexagonal core).
/// It must remain free of any I/O, persistence, or UI dependency:
///
/// * No `package:flutter*`
/// * No `package:drift*` / SQLite
/// * No `package:dio` / HTTP
/// * No `package:mobile_scanner*`
///
/// The invariant is enforced two ways:
/// 1. `analysis_options.yaml` runs the analyzer in pure-Dart mode.
/// 2. `test/domain_core_test.dart` greps `lib/**.dart` for forbidden imports
///    so the rule is checked by `dart test`, not just the analyzer.
///
/// Stories 1.2+ populate this surface (PlateLog, FoodEntry, ports, use-cases).
library;

export 'src/entities/coach_question.dart';
export 'src/entities/database_food.dart';
export 'src/entities/food_entry.dart';
export 'src/entities/plate_log.dart';
export 'src/ports/ai_rung.dart';
export 'src/ports/coach.dart';
export 'src/ports/encrypted_store.dart';
export 'src/ports/food_catalog.dart';
export 'src/ports/voice_transcriber.dart';
export 'src/results/catalog_failure.dart';
export 'src/results/coach_question_result.dart';
export 'src/results/recognition_failure.dart';
export 'src/results/store_failure.dart';
export 'src/use_cases/record_plate.dart';
export 'src/value_types/composition_pattern.dart';
export 'src/value_types/food_entry_draft.dart';
export 'src/value_types/quantity_range.dart';
export 'src/value_types/recognized_food.dart';

const String domainCoreVersion = '0.1.0';
