# V6 Mobile Stack Pack MVP

## Summary

V6-Mobile adds a local, read-only mobile project intake layer for iOS and Android projects. The MVP can identify mobile stack metadata, describe safe worker requirements, and apply governance gates for build, simulator or emulator validation, signing, and release operations.

This release does not build, test, sign, upload, deploy, connect to servers, or read credential values.

## Scope

- Package: `packages/mobile-stack-pack/`
- CLI:
  - `studio mobile ios-detect --project <path> --dry-run`
  - `studio mobile android-detect --project <path> --dry-run`
  - `studio mobile validate --platform ios --dry-run`
  - `studio mobile validate --platform android --dry-run`
- Examples:
  - `packages/mobile-stack-pack/examples/ios-project.example.json`
  - `packages/mobile-stack-pack/examples/android-project.example.json`

## iOS Capability

The iOS detector supports read-only detection for:

- `.xcodeproj`
- `.xcworkspace`
- Swift
- SwiftUI
- Objective-C
- `Podfile`
- `Package.swift`
- planned `xcodebuild` build/test commands
- planned simulator target metadata
- signing and provisioning references only

All Xcode, simulator, signing, and upload operations are disabled in this MVP.

## Android Capability

The Android detector supports read-only detection for:

- `settings.gradle`
- `settings.gradle.kts`
- `build.gradle`
- `build.gradle.kts`
- Kotlin
- Java
- `AndroidManifest.xml`
- Android SDK reference metadata
- Gradle wrapper metadata
- planned assemble/test/emulator commands
- keystore references only

All Gradle, emulator, signing, and release operations are disabled in this MVP.

## Worker Requirements

| Platform | Worker OS | Device Runtime | Signing |
| --- | --- | --- | --- |
| iOS | macOS | iOS Simulator metadata required | reference only |
| Android | macOS or Linux | Android Emulator metadata required | reference only |

Mobile workers are metadata-only in this release. Real build workers belong to a later Pilot/V6 runtime integration step.

## Governance Gates

| Action | Risk | Gate |
| --- | --- | --- |
| build | MEDIUM | allowed dry-run |
| simulator test | MEDIUM | allowed dry-run |
| signing | HIGH | proposal only |
| TestFlight release | CRITICAL | human approval required |
| App Store release | CRITICAL | human approval required |
| Google Play release | CRITICAL | human approval required |

## Safety Boundaries

- Xcode invocation: disabled
- Gradle invocation: disabled
- Simulator invocation: disabled
- Emulator invocation: disabled
- Signing asset reads: disabled
- Credential values: not read
- Keystore/provisioning profile storage: disabled
- App Store/Google Play release: disabled
- Deploy: disabled
- Production operations: disabled
- Server access: disabled
- Managed project writes: disabled
- `jinhu-smart-park` modifications: forbidden

## Validation

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs mobile ios-detect --project packages/mobile-stack-pack/examples/ios-project.example.json --dry-run
node packages/orchestrator-core/bin/studio.mjs mobile android-detect --project packages/mobile-stack-pack/examples/android-project.example.json --dry-run
node packages/orchestrator-core/bin/studio.mjs mobile validate --platform ios --dry-run
node packages/orchestrator-core/bin/studio.mjs mobile validate --platform android --dry-run
node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
git diff --check
git status
```

Expected result: all commands pass without real mobile toolchain execution or credential access.
