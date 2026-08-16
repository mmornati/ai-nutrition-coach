/// OpenPlate adapter package.
///
/// Houses concrete implementations of the ports declared in `domain_core`:
/// the drift encrypted store (AD-8), the OFF/USDA `FoodCatalog` adapters
/// (AD-4), and the `AiRung` no-op / future recognizer adapters (AD-5).
///
/// Stories 1.2+ populate this surface. The encrypted store + web stub
/// land here; later stories add the remaining adapters.
library;

export 'src/catalog/lru_cache.dart';
export 'src/catalog/off_barcode_source.dart';
export 'src/catalog/offline_first_food_catalog.dart';
export 'src/catalog/seed_foods.dart';
export 'src/store/create_encrypted_store.dart';
export 'src/store/encrypted_store_adapter.dart';
export 'src/store/secure_key_source.dart';
export 'src/store/web_encrypted_store_stub.dart';
export 'src/voice/noop_voice_transcriber.dart';

const String integrationsVersion = '0.1.0';
