/// OpenPlate adapter package.
///
/// Houses concrete implementations of the ports declared in `domain_core`:
/// the drift encrypted store (AD-8 — mobile sqlite3mc + web
/// `WasmEncryptedStore` with PBKDF2 session key, Story 4.1), the
/// OFF/USDA `FoodCatalog` adapters (AD-4), the four `AiRung` adapters
/// (no-op / hosted-quota / byok / local seam; AD-5), and the v1
/// `TemplateCoach` rung behind the `Coach` port (AD-7 / NFR3).
///
/// Stories 1.2+ populate this surface. Story 4.1 swaps the v0
/// `WebEncryptedStoreStub` for the real `WasmEncryptedStore`.
library;

export 'src/ai/byok_ai_rung.dart';
export 'src/ai/byok_key_store.dart';
export 'src/ai/byok_openai_compatible_provider.dart';
export 'src/ai/cloudflare_workers_ai_provider.dart';
export 'src/ai/gemini_free_provider.dart';
export 'src/ai/hosted_quota_ai_rung.dart';
export 'src/ai/hosted_quota_provider.dart';
export 'src/ai/local_ai_rung.dart';
export 'src/ai/noop_ai_rung.dart';
export 'src/ai/openai_compatible_byok_provider.dart';
export 'src/ai/quota_counter.dart';
export 'src/catalog/lru_cache.dart';
export 'src/catalog/off_barcode_source.dart';
export 'src/catalog/offline_first_food_catalog.dart';
export 'src/catalog/seed_foods.dart';
export 'src/coach/template_coach.dart';
export 'src/l10n/coach_strings.dart';
export 'src/store/create_encrypted_store.dart';
export 'src/store/local_coach_note_store.dart';
export 'src/store/lock_screen.dart';
export 'src/store/wasm_encrypted_store.dart';
export 'src/store/web_session_key.dart';
export 'src/voice/noop_voice_transcriber.dart';

const String integrationsVersion = '0.1.0';
