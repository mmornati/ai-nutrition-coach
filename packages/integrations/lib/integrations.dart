/// OpenPlate adapter package.
///
/// Houses concrete implementations of the ports declared in `domain_core`:
/// the drift encrypted store (AD-8), the OFF/USDA `FoodCatalog` adapters
/// (AD-4), and the `AiRung` no-op / future recognizer adapters (AD-5).
///
/// Stories 1.2+ populate this surface. At scaffold time the package is empty
/// so `melos bootstrap` resolves cleanly and `flutter analyze` stays quiet.
library;

const String integrationsVersion = '0.1.0';
