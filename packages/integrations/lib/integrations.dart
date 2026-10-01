/// AI Nutrition Coach adapter package.
///
/// Houses concrete implementations of the ports declared in `domain_core`:
/// the drift encrypted store (AD-8 — mobile sqlite3mc ChaCha20-Poly1305; web sqlite3mc-wasm on
/// IndexedDB behind a passphrase-derived key, Phase 2B / ADR-0002), the
/// OFF/USDA `FoodCatalog` adapters (AD-4), the four `AiRung` adapters
/// (no-op / hosted-quota / byok / local seam; AD-5), and the v1
/// `TemplateCoach` rung behind the `Coach` port (AD-7 / NFR3).
///
/// Stories 1.2+ populate this surface. Phase 2B ships the real
/// web store (`WasmEncryptedStore` + `WebStoreController`).
library;

export 'src/ai/ai_settings.dart';
export 'src/ai/ai_settings_store.dart';
export 'src/ai/byok_ai_rung.dart';
export 'src/ai/byok_endpoint.dart';
export 'src/ai/byok_key_store.dart';
export 'src/ai/byok_openai_compatible_provider.dart';
export 'src/ai/cloudflare_workers_ai_provider.dart';
export 'src/ai/gemini_free_provider.dart';
export 'src/ai/hosted_quota_ai_rung.dart';
export 'src/ai/hosted_quota_provider.dart';
export 'src/ai/local_ai_rung.dart';
export 'src/ai/noop_ai_rung.dart';
export 'src/ai/openai_compatible_byok_provider.dart';
export 'src/ai/photo_sanitizer.dart';
export 'src/ai/quota_counter.dart';
export 'src/ai/rate_limit_reset.dart';
export 'src/catalog/lru_cache.dart';
export 'src/catalog/off_barcode_source.dart';
export 'src/catalog/offline_first_food_catalog.dart';
export 'src/catalog/seed_foods.dart';
export 'src/coach/template_coach.dart';
export 'src/l10n/coach_strings.dart';
export 'src/net/capped_response.dart';
export 'src/store/create_encrypted_store.dart';
export 'src/store/failed_store.dart';
export 'src/store/local_coach_note_store.dart';
export 'src/store/local_data_eraser_stub.dart'
    if (dart.library.io) 'src/store/local_data_eraser_io.dart';
export 'src/store/secure_key_source.dart';
export 'src/store/secure_storage_options.dart';
export 'src/store/sqlite_key_attach.dart';
export 'src/store/wasm_coach_note_store.dart';
export 'src/store/wasm_encrypted_store.dart';
export 'src/store/web_database_backend.dart';
export 'src/store/web_kdf.dart';
export 'src/store/web_session_key.dart';
export 'src/store/web_store_controller.dart';
export 'src/store/web_store_lock.dart';
export 'src/store/web_store_meta.dart';
export 'src/store/web_store_storage.dart';
export 'src/sync/drift_sync_queue.dart';
export 'src/sync/local_only_sync_adapter.dart';
export 'src/util/async_mutex.dart';
export 'src/config/app_identity.dart';
export 'src/config/build_config.dart';
export 'src/export/csv_exporter.dart';
export 'src/export/json_exporter.dart';
export 'src/export/export_destination.dart';
export 'src/export/export_paths.dart';
export 'src/export/export_destination_stub.dart'
    show RecordingExportDestination;
export 'src/voice/noop_voice_transcriber.dart';

const String integrationsVersion = '0.1.0';
