// Marker value type for the web rung's in-memory session key (AD-8 /
// Story 4.1).
//
// The web build's encrypted store is "session-sealed" — the same drift
// schema runs on `sqlite3.wasm` with a PBKDF2-derived key held in
// memory for the session lifetime only. A page reload or session
// restart requires the user to re-enter the passphrase. The key
// material never crosses the `domain_core` boundary: only the boolean
// "is set" assertion does. The actual key holder lives in
// `packages/integrations/lib/src/store/web_session_key.dart`.
//
// This marker type exists so the `WasmEncryptedStore` adapter can
// pattern-match a typed `StoreClosed` failure without leaking the
// concrete holder into the core. The value carries no key material
// and is `const`; the `toString` is intentionally redacted.

class WebSessionKey {
  const WebSessionKey();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is WebSessionKey;

  @override
  int get hashCode => (WebSessionKey).hashCode;

  @override
  String toString() => 'WebSessionKey()';
}
