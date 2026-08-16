# OpenPlate — adults only (Story 5.1 / FR-13 / NFR-4)

OpenPlate v1 is strictly adults-only. No under-13 accounts. No
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
- **Voice is transcription-only.** The `VoiceTranscriber` port
  (Epic 1) returns a text string — no audio fingerprint, no
  speaker identification, no voice biometric.
- **Plate photos are processed with no identity linkage.** The
  `AiRung` port takes raw photo bytes and returns typed
  `RecognitionResult`s; no face-detection API is referenced; no
  image is uploaded with an identity token.
- **Local inference stays on-device.** The v2 `local` rung
  (Epic 3 / FR-8) runs the model in-process — no biometric data
  leaves the device.

## What this means for contributors

- **No `package:local_auth`, `package:face_recognition`, or
  equivalent.** The static check
  (`tools/check_adults_only.dart`) rejects every banned biometric
  import.
- **No `childProfile`, `under13`, `minorAccount`, `teenAccount`,
  `parentAccount`, `ageGate`, or `birthDate` field.** The check
  rejects every banned under-13 reference.
- **No `FaceID` / `TouchID` / `LocalAuthentication` /
  `face_detection` / `voice_print` reference.** The check rejects
  every banned biometric reference.
- **The `PrivacyGuard` runs at startup.** `apps/client/lib/main.dart`
  calls `PrivacyGuard.assertAdultsOnly()` before `runApp` so a
  future PR that introduces a banned reference fails loudly in
  debug builds. The static check is the durable enforcement
  surface; the runtime guard is a safety net for widget tests.

## How to verify

```sh
melos run check:release-posture
```

The script chains the adults-only check alongside the existing
telemetry + release-posture checks. A regression fails the build.

## Why this matters

COPPA's 2025 amendments now treat biometric identifiers as
"personal information" and require verifiable parental consent for
third-party disclosure. The Kurbo $1.5M FTC settlement
(including algorithmic disgorgement) shows the trap in the
age-gate that "encourages lying." The safe lane is plain plate
photos (no face), adult-account observed profiles, local-only
inference (the "internal operations" COPPA carve-out). OpenPlate
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
