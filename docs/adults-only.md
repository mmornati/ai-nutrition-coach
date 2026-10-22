# AI Nutrition Coach — adults only (Story 5.1 / FR-13 / NFR-4)

AI Nutrition Coach v1 is strictly adults-only. No under-13 accounts. No
biometric identification anywhere. The promise is architecture, not
policy — every shipped surface is pinned by a static check + a
developer-facing guard + the named-reviewer QA gate (Story 5.3).

## What this means

- **No signup flow.** v1 has no account, no profile, no age gate.
  Epic 1-4 ships exactly one local identity per install; there is
  no path to a second profile.
- **No biometric identification.** No face-detection, no
  voice-print, no `LocalAuthentication` prompt, no TouchID /
  FaceID. The mobile target ships no biometric prompt; the web
  target ships no biometric API call.
- **Voice is transcription-only.** *Describe a meal* can record up to 30 seconds and send it to a
  Whisper-compatible `/audio/transcriptions`; the answer is a text string — no audio fingerprint, no
  speaker identification, no voice biometric. The recording is held in memory until the request returns and is never
  stored. `tools/check_adults_only.mjs` also rejects speaker identification / diarization identifiers.
- **Plate photos are processed with no identity linkage.** The
  `AiRung` port takes raw photo bytes and returns typed
  `RecognitionResult`s; no face-detection API is referenced; no
  image is uploaded with an identity token.
- **Local inference stays on-device.** The v2 `local` rung
  (Epic 3 / FR-8) runs the model in-process — no biometric data
  leaves the device.

## What this means for contributors

- **No biometric package (`local-auth`, `face-api`, `react-native-biometrics`, ...) or
  equivalent.** The static check
  (`tools/check_adults_only.mjs`) rejects every banned biometric
  package and identifier.
- **No `childProfile`, `under13`, `minorAccount`, `teenAccount`,
  `parentAccount`, `ageGate`, or `birthDate` field.** The check
  rejects every banned under-13 reference.
- **No `FaceID` / `TouchID` / `LocalAuthentication` /
  `face_detection` / `voice_print` reference.** The check rejects
  every banned biometric reference.
- **Enforcement is the static check, not a runtime guard.** An earlier
  `PrivacyGuard` class claimed to assert this at startup, but its check
  always returned `true` (security review F9), so it was removed rather
  than left claiming something it did not do.
  `tools/check_adults_only.mjs` (run by `pnpm verify`; self-tested by `tools/gates/adults-only.test.mjs`)
  and the named-reviewer gate are the enforcement surfaces.

## How to verify

```sh
pnpm check:adults-only
```

`pnpm verify` runs the adults-only check alongside the
telemetry + release-posture checks. A regression fails the build.

## Why this matters

COPPA's 2025 amendments now treat biometric identifiers as
"personal information" and require verifiable parental consent for
third-party disclosure. The Kurbo $1.5M FTC settlement
(including algorithmic disgorgement) shows the trap in the
age-gate that "encourages lying." The safe lane is plain plate
photos (no face), adult-account observed profiles, local-only
inference (the "internal operations" COPPA carve-out). AI Nutrition Coach
v1 stays in that lane by construction.

## Cross-references

- [`docs/telemetry-posture.md`](./telemetry-posture.md) — the
  privacy posture on the network surface (Story 4.5 / FR-12).
- [`docs/your-data.md`](./your-data.md) — the protection posture
  on web vs mobile (Story 4.1 / AD-8).
- [`docs/v2-managed-oversight.md`](./v2-managed-oversight.md) —
  the v2 managed-oversight seam (Story 5.2 / FR-14); the seam
  carries the same FR-13 invariant into v2.
- [`docs/no-dark-patterns-standard.md`](./no-dark-patterns-standard.md)
  — the named-reviewer gate (Story 4.6 + Story 5.3 / FR-15).
