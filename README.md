# Spell-Bee

A reviewable, responsive local MVP of the five-word spelling game. React + TypeScript + Vite, with real Firebase Auth, Firestore, Functions, and Storage **emulators**. It uses the 100 reviewed recordings in `artifacts/voice-review` and the selected `en-US-Standard-C` voice.

## Start locally

```sh
npm install
npm run dev
```

- Game: <http://127.0.0.1:5173>
- Emulator dashboard: <http://127.0.0.1:4000>
- Stop: Ctrl+C. Emulator data exports to `.local/emulators` and imports on the next start.
- Node 22 is the Functions runtime. A checksum-verified Node 22.23.4 binary is installed in this workspace’s ignored `.local/toolchains` directory; `npm run dev` prefers it. On another machine, install Node 22 before running. Java 21+ and Firebase CLI are required for emulators; this machine’s Java 26 and CLI 15.30.0 have been exercised.
- If an emulator port is in use, stop the earlier session rather than running a second stack.
- A fresh checkout needs the source word/audio artifacts preserved in this repository. `prepare:assets` copies them to ignored server-only `functions/assets`; it does not upload anything.

## Safety boundary

The default CLI project is the **nonexistent demo project** `demo-spell-bee`, not `spell-bee-c218a`. There is no staging cloud project. Client configuration points only to loopback emulators. Server startup and seeding fail closed unless the demo project and local emulator hosts are present. `npm run deploy` intentionally fails, and Functions code cannot initialize in production. No production resource registration, API enablement, upload, rule edit, or deployment was done for this implementation.

The Vite server denies access to the private Functions source/assets, tests, scripts, review artifacts, and local data. The production client build contains no canonical word bank, answer key, or private audio files. Local Firebase emulator administrative interfaces are intended for the developer only and bind to loopback.

## What to review

1. Enter a display name and play the daily five. Tap Listen and read the current word’s definition; submit one answer at a time. The spelling stays hidden until results. Replays have no penalty. Refresh to resume the same attempt.
2. Read personal results: **+1 correct, 0 incorrect or unanswered; total 0–5**. Correct answers are revealed only after completion or expiry. Ties use competition ranks (1, 1, 3), with no speed tie-breaker.
3. Create a friend challenge or a rematch and copy its link. Use another browser profile for another player. Private challenges last exactly 24 hours from server creation; daily games close at midnight UTC.
4. Use the clearly labeled local-only “close this challenge” control on results to inspect final standings without waiting. This changes only that emulator challenge. There is no interim leaderboard.
5. Save results through email-link Authentication. The local sign-in link appears in the dialog and emulator UI; **no email is sent**. Credential linking preserves the guest UID. Existing-account collisions retain the account’s ranked attempt and keep the guest result as unranked history.
6. Click a platform Download button. It opens a coming-soon notice and an optional launch-only email signup. Signup deduplicates by normalized email/platform; Preferences can withdraw the saved browser’s requests. No mailing provider is connected.
7. Decline optional analytics and keep playing. Allow/decline changes are persisted server-side. Local optional events are consent-gated in Firestore; **no Google Analytics SDK or remote collection runs in this review**.
8. Inspect history, privacy copy, keyboard navigation, and the mobile layout. The initial audio-only limitation is disclosed; its release acceptance still needs Curtis’s decision.

## Checks

```sh
npm test                # six domain/safety unit tests
npm run build           # frontend typecheck/build + Functions compile
npm run test:integration # while npm run dev is running; creates only local test identities
```

For an isolated emulator test run, stop the running stack first, then use `npm run test:emulators`. This seeds the demo project and runs the same integration scenarios. Integration checks cover idempotent creation/start/answer retries, replayed submissions after closure, partial expiry, answer privacy, direct database/storage denials, audio grants, rematches, both account linking paths, consent, signup deduplication/withdrawal, history retention, and deletion.

Local test users are identifiable by test display names and `@example.com` email addresses. Tests don’t clear a reviewer’s emulator database. They use their own private challenges; the shared daily fixture is not forcibly closed. Some archived test history is deliberately retained to exercise the retention policy.

## Repository map

- `src/`: app, responsive styling, Firebase client adapter. Only demo emulator configuration.
- `functions/src/domain.ts`: scoring, UTC windows, competition ranks, calendar retention, safety guard.
- `functions/src/index.ts`: callable API, transactional attempts/account claims, short-lived audio grants, consent/events, signup withdrawal, deletion queue, scheduled maintenance.
- `firestore.rules`, `storage.rules`: deny direct client access. Functions mediate protected operations.
- `firestore.indexes.json`: versioned query indexes.
- `scripts/`: guarded asset preparation, local seed, startup and integration checks.
- `docs/LOCAL_REVIEW.md`: implementation status, data model, and production release gates.

## Retention implementation

The daily maintenance function expires app events/referrals after 60 days, signup records by their calendar-year deadline, challenge links/standings after 90 days, and unlinked guests after 90 inactive days. Registered-player history snapshots omit other players’ identities. Explicit deletion immediately disables the identity and hides its display name, then queues idempotent cleanup within seven days. Maintenance also removes linked aliases and retained personal history.

Inactive registered accounts are **not automatically deleted unless a 30-day warning was actually delivered for the current inactivity period**. The local warning outbox is `pending-provider`; no sender is configured. The scheduled function is exported, but schedules don’t automatically run in this local emulator setup. Integration checks invoke the emulator-only maintenance control explicitly. Production deployment, scheduler execution, email warning delivery, logging retention, provider analytics deletion, and daily seven-day backups remain release work, not completed cloud configuration.

## Deployment

Production deployment requires Curtis’s explicit approval, removal/replacement of the emulator-only gates in a reviewed release, real Firebase web configuration, authentication/provider/domain setup, App Check enforcement, Storage provisioning, and the release checks in `docs/LOCAL_REVIEW.md`. Do not change `.firebaserc` to production just to preview the app. Do not put secrets or service-account keys in the client or repository.

## Production preparation

See [the production review](docs/PRODUCTION_REVIEW.md) for verified cloud state,
release configuration, remaining gates, and the proposed Firebase Hosting URL.
`npm run build:production` requires verified public Firebase web configuration and
an App Check site key; it deliberately refuses an incomplete release.
`firebase.production.json` is a reviewable candidate, not a deployment approval.
Normal development and seed commands remain restricted to local emulators.


Spell-Bee is live at https://spell-bee-c218a.web.app. See `docs/PRODUCTION_REVIEW.md` for the verified release result and `docs/PRODUCTION_OPERATIONS.md` for reporting, deletion/recovery, manual inactivity-warning operations and live checks. Production release was explicitly authorized; local seed/test commands remain demo-emulator-only.

## Bee Club rewards

The game now includes animated answer reveals and spelling corrections, a perfect-round celebration, spoiler-free emoji result sharing, UTC daily streaks, personal best/accuracy, nectar levels, achievement badges, and collectible bee outfits. Reduced-motion preferences disable the new reveal and confetti animations.

Bee Club progress is stored in this browser separately for each Firebase identity; it starts with results opened after this update and does not synchronize across devices or migrate when guest identities change. Clearing browser storage resets it. Deleting an identity through Preferences also clears its local rewards.

Practice your misses and the Garden of Words / Long-word Safari bonus rounds use definitions from already revealed results. They are unranked and update mastery only, leaving original scores and nectar unchanged. Private challenge words remain hidden until closure. Head-to-head win/draw/loss records accumulate when a completed private challenge's final standings are opened; the standings API returns caller-specific opaque opponent IDs so duplicate display names do not merge rivalries. Records cover the returned standings (up to 100 players).

Validation: `npm test` includes reward idempotency, mastery deduplication, UTC streak rollover and private/unrevealed result boundaries in addition to the existing domain checks.

## Adventure mode

Choose **Adventure** in the navigation or **Play Adventure** above the daily game. Twelve five-word levels span Flower Fields, Honey Hollow, and Royal Gardens, using a separate 60-word public learning collection. Familiar words come first; later worlds introduce longer and more complex spellings. Audio uses the device's English speech voice; definitions, a first-letter reveal, and spelling hints also support play when speech is unavailable.

- Earn one star per correct word: 0 correct earns 0 stars, and a perfect five earns 5 stars. The twelve-level map has 60 available stars. Every completion unlocks the next level, with unlimited free retries and no lives or purchases.
- Adventure chests randomly reveal one prize after opening: a booster bundle or an unowned bee accessory. Consumable boosters start at zero. Regular word replays are unlimited and never spend inventory. Slow listens consume slow-replay rewards, and letter/hint rewards apply to the current word. Unplayed speech failures refund consumed rewards. Existing saves retain unspent chest rewards, with old starter balances removed once. Daily and private challenges retain their original scoring and hidden-answer rules.
- Earn 10 honey on a level's first completion and 5 per correct answer. Improving a best score earns only the difference. Four mystery chests unlock at 100-honey milestones; stars, the honey jar, bee, and reward reveals animate with reduced-motion support. Submitted answer feedback and unfinished level progress persist locally.
- Stars, honey, outfits, drafts, and pending team contributions are browser-local per Firebase identity. They do not migrate across browsers or guest-to-account identity changes. Clearing browser storage removes them; identity deletion in Preferences clears this browser's Adventure progress.
- Weekly hives are shared server-side. Create a team, copy its invite, or join by code/link. The goal is 100 correct words together, resetting Monday at 00:00 UTC. Boosters are welcome. The server verifies submitted Adventure spellings and credits each word position once per level, per player, per week; retries can add missed words but cannot count the same word twice. Team totals refresh every 30 seconds and when the page becomes visible. Failed contributions remain queued locally for retry.
- Team codes permit anyone holding them to join. Team names/membership expire after 90 days, contributions after two weeks. Maintenance removes expired data; identity deletion queues membership and contribution cleanup. Aggregate team totals retain no player names. These are cooperative learning totals, not a competitive or tamper-proof ranking; the Adventure collection and hints are intentionally public.

Adventure validation adds six unit scenarios and integration checks for shared team totals, concurrent retry deduplication, score improvement, malformed submissions, leaving a team, and deletion cleanup. The production frontend and new callable functions must be released together; this update does not deploy to the public Firebase site.

## Native iPhone app

A standalone SwiftUI implementation now lives in `ios/`. Open `ios/SpellBee.xcodeproj` and run the **SpellBee** scheme on an iPhone simulator. See [the native app guide](ios/README.md) for modes, local emulator setup, native tests, progress backup/restore, family restrictions, and the remaining Apple-account / App Store release work. The web application remains separate.
