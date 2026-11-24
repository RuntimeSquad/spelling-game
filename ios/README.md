# Spell-Bee for iPhone

Native Swift + SwiftUI application. No web view, Capacitor, JavaScript runtime, ads, purchases, or analytics SDK. Open `SpellBee.xcodeproj`, select **SpellBee**, choose an iPhone simulator and Run. It targets iOS 17 or later and builds with the installed Xcode 27.2 / iOS 27.2 SDK.

Run `ios/scripts/run-simulator.sh` from the repository to build, install and open the native game in Device Hub / Simulator. It opens the 13+ development experience so all modes can be tried; set `SPELLBEE_EXPERIENCE=child` for the restricted family experience. The simulator override is not used in an App Store build.

## Playable now

- Twelve Adventure levels / 60 learning words in Flower Fields, Honey Hollow, and Royal Gardens.
- One star per correct word (0–5); personal bests, honey improvements without duplicate rewards, sequential level unlocks and unlimited retries.
- Native spoken words on entering a question, unlimited normal replays, ascending correct and descending incorrect cues, haptics, and richer four/five-star celebrations. Daily and friend answers use neutral submission cues until results are revealed.
- Zero starting consumable boosters. Mystery chests award one booster bundle or an unowned accessory; consumable counts and equipped accessories persist. Reduced Motion stops celebration movement.
- Family experience: offline Adventure and private deterministic daily words; no Firebase identity, network calls, teams, friend connections, or public standings. Backup/experience settings require device-owner authentication. This device-owner gate is not a verified parental identity or consent system.
- 13+ experience: live native daily/friend/team screens connected to the existing demo Firebase emulators in Debug simulator builds. Nicknames are preset, invitations use the share sheet / `spellbee://challenge/<id>` links, or manual challenge codes. No chat, stranger matching or profile search. Private challenge results wait for server closure.
- Friends offers “Invite friends now” before any challenge attempt. It creates the invitation and immediately presents the system share sheet; reopening it reuses the current unexpired private challenge. Cancelling sharing leaves the challenge available to play or invite again. Under-13 profiles cannot access this flow. Real-phone invitations still require the production online configuration described below.
- Native local atomic save, interrupted-round resume, and JSON backup export/import through Files (including iCloud Drive). A parent/device owner manages family backups. Backup files exclude age/experience settings and online authentication tokens. The Firebase emulator identity is stored in device-only Keychain and survives ordinary relaunches; it is not included in progress backups.
- Duo-aware layouts use live window size, active fold regions and camera occlusions on iOS 27.1+. The real Duo simulator now runs on the installed iOS 27.1 runtime, with closed/open/partially folded checks. See [Duo readiness and evidence](DUO_READINESS.md).

## Run online modes locally

From the repository root, run `npm run dev` (reuse an existing stack). Emulator ports are 9099 (Auth), 5001 (Functions), 8080 (Firestore), and 9199 (Storage). **Do not switch the CLI project to production.** Network requests are restricted to loopback demo services and only compiled for Debug simulator builds. Adventure and family daily play work without this stack.

For development, launch with `-experience older` to test the 13+ screens, or `-experience child` for restricted family screens. These are simulator test overrides, not release age verification. In the normal app, the initial experience selection is persisted; switching a child profile to 13+ requires device-owner authentication. A simulator without a passcode cannot unlock this gate.

## Tests

```sh
swift test --package-path ios/SpellBee --scratch-path /tmp/spellbee-core-build
xcodebuild -project ios/SpellBee.xcodeproj -scheme SpellBee \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' \
  -derivedDataPath ios/.build CODE_SIGNING_ALLOWED=NO test
```

Core tests cover score/reward idempotency, zero-star completion, level locks, booster spending, unique cosmetic prizes, deterministic daily selection and backup decoding. UI tests play a perfect round, verify family social restrictions, exercise live emulator daily/friend/team screens, and capture expanded layout. Result bundles and build outputs are ignored. `scripts/generate-project.py` regenerates the deterministic Xcode project without third-party tooling; `scripts/make-icon.swift` generates the app’s original vector-style icon.

The Adventure map places your dressed bee above the current level and flies it to the next stop when you return after completing a round. Completed levels retain their stars and a checkmark; the next stop is numbered and marked “Up next.” The map scrolls to follow the bee, including across gardens, and respects Reduce Motion. The Adventure UI regression verifies the bee reaches level 2 and the completed/current/next labels update after a full round. Closed and expanded Duo screenshots are in `screenshots/duo-qa/moving-bee-closed.png` and `moving-bee-map.png`.

## Remaining release work

This is a playable simulator development build, **not an App Store-ready release**. No Apple account was signed into, no cloud resources were registered, and nothing was deployed or submitted.

- Choose the final publisher/bundle identifier and Apple Developer team, sign the app, enable iCloud/CloudKit or another reviewed account recovery service. Current recovery is explicit Files backup/restore; there is no automatic sync or online account recovery across phones yet.
- Implement a reviewed age-assurance / parent-managed-account design. The preview’s device-owner gate and self-selected experience must not be represented as verified parental consent. Children remain offline in this implementation. Server-side enforcement for native age profiles and any future child cloud feature is a release gate.
- Register an iOS Firebase app, wire native App Attest/App Check and production configuration, and test authentication and challenge recovery on physical devices. Production networking fails closed in this build; the demo REST client is not a production auth adapter. No production App Check bypass was introduced.
- Add durable queued team-contribution retries for intermittent connectivity, universal-link hosting/entitlements, cross-device account history recovery, and account deletion UX/verification. The current team endpoint is live in the simulator but failed contributions surface an error rather than silently claiming sync.
- Review children’s privacy, data retention and age rating, in-app privacy/support materials, generated privacy manifest, social content handling, and App Store metadata. Test real speech voices, audio interruptions, accessibility sizes, passcode/biometric parent controls, backup recovery through Files and physical iPhone performance.
- Complete physical iPhone Duo touch/audio/performance and repeated-fold validation before release; current native simulator coverage and remaining limits are recorded in DUO_READINESS.md.
