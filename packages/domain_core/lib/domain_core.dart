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

const String domainCoreVersion = '0.1.0';
