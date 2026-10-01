# Stack

Web-verified current (pub.dev / dev) Aug 13 2026. Every pin = latest stable at verification time; drift 2.32+ bundles sqlite3 v3 automatically (no separate sqlitecipher native lib needed).

| Name | Version | Role |
| --- | --- | --- |
| Dart SDK | ^3.13.0 | language |
| Flutter | 3.47.0 | current stable (release notes + 2026 schedule) |
| flutter_riverpod (codegen) | 3.4.2 | state (UI derived views, AD-3) |
| drift / drift_dev | 2.34.3 / 2.34.x | local store, single source of truth |
| sqlite3 (+ sqlite3mc build hook) | 3.5.x | ChaCha20-Poly1305 at rest (AD-8; hook user-define lives in the workspace-root pubspec); web via sqlite3.wasm (sqlite3mc experimental) |
| flutter_secure_storage | 11.0.0 | Keychain/Keystore: DB key + BYOK key |
| mobile_scanner | 7.4.0 | barcode (CAP-2) |
| image_picker | 1.2.3 | capture (CAP-1) |
| dio | 5.11.0 | OFF/USDA + AI HTTP |
| melos | 8.2.2 | pub-workspace orchestration |
| patrol / patrol_cli | 4.8.0 / 4.6.1 | E2E (mobile) |
| test / flutter_test / integration_test | SDK-bundled | unit/widget/integration |