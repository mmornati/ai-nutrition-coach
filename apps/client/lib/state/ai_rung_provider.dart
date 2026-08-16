// `AiRung` config + adapter providers for the AI tier ladder
// (Story 3.1 / AD-5 / FR6 / FR7 / FR8).
//
// `aiRungConfigProvider` is the single Riverpod seam that holds
// the build-time `AiRungConfig` — the config is resolved once at
// app start, overridden in `main.dart`, and read-only thereafter.
// Exactly one rung is active at any time; the provider graph reads
// the config and constructs the matching adapter.
//
// `aiRungProvider` is the v1 seam the photo screen already reads
// (Story 1.8). With Story 3.1 the provider is config-driven: it
// reads `aiRungConfigProvider` and returns the matching adapter.
// Production callers override `aiRungConfigProvider` to flip the
// active rung without touching the screen.
//
// Story 3.2 extends `aiRungProvider` with the `hostedQuota` branch
// (constructs `HostedQuotaAiRung(quotaCounter, hostedQuotaProvider)`);
// Story 3.3 adds the `byok` branch (constructs
// `ByokAiRung(byokKeyStore, byokOpenAiCompatibleProvider,
// recordByokChange)`).
//
// AD-1: this file lives under `apps/client/lib/` (the only place
// Riverpod state and the rung port seam live together). The domain
// core never imports Flutter or Riverpod; the structural grep test
// in `packages/domain_core/test/domain_core_test.dart` pins the
// rule.
//
// AD-5: the seam hands out `AiRung` (the interface), never the
// concrete `NoopAiRung` / `HostedQuotaAiRung` / `ByokAiRung` /
// `LocalAiRung` types. Tests inject a `FakeAiRung` (Story 1.8)
// that records `recognize` calls and returns configured results.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

/// The build-time `AiRungConfig` — overridden in `main.dart` with
/// `const AiRungConfig(kind: AiRungKind.noOp)` so the v1 path
/// (`NoopAiRung`) is the default. Stories 3.2 / 3.3 flip the
/// config to `hostedQuota` / `byok` without touching the screen.
final aiRungConfigProvider = Provider<AiRungConfig>(
  (ref) => throw UnimplementedError(
    'aiRungConfigProvider must be overridden at the ProviderScope root '
    'with the result of `AiRungConfig(kind: AiRungKind.noOp)` — see '
    'apps/client/lib/main.dart.',
  ),
);

/// The `QuotaCounter` seam — overridden in `main.dart` with the
/// production `SecureStorageQuotaCounter(ceiling: kHostedQuotaPerDay)`
/// (Story 3.2 / FR6). Tests inject an `InMemoryQuotaCounter`.
final quotaCounterProvider = Provider<QuotaCounter>(
  (ref) => throw UnimplementedError(
    'quotaCounterProvider must be overridden at the ProviderScope root '
    'with the result of `SecureStorageQuotaCounter(ceiling: '
    'kHostedQuotaPerDay)` — see apps/client/lib/main.dart.',
  ),
);

/// The `HostedQuotaProvider` transport seam — overridden in
/// `main.dart` with the production `CloudflareWorkersAiProvider`
/// (Story 3.2 / FR6 / OQ-2 default). Tests inject a fake
/// provider; the OQ-2 build-time swap replaces this with the
/// `GeminiFreeProvider` stub.
final hostedQuotaProviderProvider = Provider<HostedQuotaProvider>(
  (ref) => throw UnimplementedError(
    'hostedQuotaProviderProvider must be overridden at the ProviderScope '
    'root with the result of `CloudflareWorkersAiProvider(...)` — see '
    'apps/client/lib/main.dart.',
  ),
);

/// The config-driven `AiRung` adapter selection. Reads
/// `aiRungConfigProvider` and constructs the matching adapter:
///
///   * `AiRungKind.noOp`         → `NoopAiRung()` (Story 1.8,
///     v1 default)
///   * `AiRungKind.hostedQuota`  → `HostedQuotaAiRung(quotaCounter,
///     hostedQuotaProvider)` (Story 3.2 / FR6)
///   * `AiRungKind.byok`         → `ByokAiRung()` (Story 3.1
///     stub; Story 3.3 fills the body)
///   * `AiRungKind.local`        → `LocalAiRung()` (FR8 v2 seam;
///
///     throws `UnsupportedError` on `recognize`)
///
/// The seam hands out `AiRung` (the interface), never the concrete
/// adapter type. Tests inject a `FakeAiRung` (Story 1.8) that
/// records `recognize` calls and returns configured results; the
/// config-driven branch is for production wiring only.
final aiRungProvider = Provider<AiRung>(
  (ref) {
    final config = ref.watch(aiRungConfigProvider);
    switch (config.kind) {
      case AiRungKind.noOp:
        return const NoopAiRung();
      case AiRungKind.hostedQuota:
        return HostedQuotaAiRung(
          quotaCounter: ref.watch(quotaCounterProvider),
          provider: ref.watch(hostedQuotaProviderProvider),
        );
      case AiRungKind.byok:
        return const ByokAiRung();
      case AiRungKind.local:
        return const LocalAiRung();
    }
  },
);