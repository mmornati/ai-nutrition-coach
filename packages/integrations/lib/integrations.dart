/// OpenPlate adapter package.
///
/// Houses concrete implementations of the ports declared in `domain_core`:
/// the drift encrypted store (AD-8), the OFF/USDA `FoodCatalog` adapters
/// (AD-4), the four `AiRung` adapters (no-op / hosted-quota / byok /
/// local seam; AD-5), and the v1 `TemplateCoach` rung behind the
/// `Coach` port (AD-7 / NFR3).
///
/// Stories 1.2+ populate this surface. The encrypted store + web stub
/// land here; later stories add the remaining adapters.
library;

export 'src/ai/byok_ai_rung.dart';
export 'src/ai/hosted_quota_ai_rung.dart';
export 'src/ai/local_ai_rung.dart';
export 'src/ai/noop_ai_rung.dart';
export 'src/catalog/lru_cache.dart';
export 'src/catalog/off_barcode_source.dart';
export 'src/catalog/offline_first_food_catalog.dart';
export 'src/catalog/seed_foods.dart';
export 'src/coach/template_coach.dart';
export 'src/l10n/coach_strings.dart';
export 'src/store/create_encrypted_store.dart';
export 'src/store/local_coach_note_store.dart';
export 'src/store/secure_key_source.dart';
export 'src/store/web_encrypted_store_stub.dart';
export 'src/voice/noop_voice_transcriber.dart';

const String integrationsVersion = '0.1.0';
