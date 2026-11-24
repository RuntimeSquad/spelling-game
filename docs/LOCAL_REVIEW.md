# Local implementation review — October 29, 2026

## Decisions applied

- One production cloud project (`spell-bee-c218a`), with no staging project. All implementation testing here uses local emulators under `demo-spell-bee`.
- en-US-Standard-C at normal speed, with all 100 word recordings approved in the latest roadmap notes.
- 1 point for correct; 0 for incorrect/missing; score range 0–5. Competition ties 1, 1, 3. Curtis explicitly clarified “no negative scores.”
- Daily UTC closure; private 24-hour window; one attempt per identity. Guest identity can be bypassed by clearing browser data or changing devices, as acknowledged in the plan.
- Daily personal results after completion/expiry; private challenge scores and answer review only after closure, including history; final standings only after closure. Expired partial attempts stay ranked with unanswered words worth zero. Display scores as percentages; retain integer 0–5 scoring internally.
- Optional email-link accounts; guest merging preserves the account’s existing ranked attempt.
- Separate analytics opt-in and launch-email consent; no newsletters or unrelated marketing.
- Shared links expire 90 days after closure. Personal account history may outlast them.

## Implemented locally

Responsive guest/daily/private/rematch play; reviewed audio playback with replay/retry; server-persisted attempts and browser draft recovery; transactional scoring and duplicate suppression; private answers; partial expiry/final standings; history; email credential linking and proof-based collision claims; consent/event recording; deduplicated platform signup and token-based withdrawal; immediate identity disablement and queued deletion; retention maintenance and warning outbox; privacy/preference dialogs; local dev scripts and deny-by-default rules.

The development build includes two **emulator-only** review/test controls: close a challenge and run maintenance. Both sit behind the module’s fail-closed emulator/demo-project guard. They must not be carried into a production release.

## Data model and invariants

- `words/{opaqueId}`: private reviewed word/version, canonical spellings, definition/note, audio path.
- `challenges/{id}`: kind, immutable opening/closing time, creator, UTC date. Daily IDs use the UTC date; private IDs derive from player + idempotency key.
- `challengeSecrets/{id}`: private immutable ordered five-word assignment.
- `attempts/{hash(challengeId:playerId)}`: owner, challenge, five bounded answer entries, receipt timestamps, status, score, ranking eligibility. Embedded answers make the five-answer update atomic without an unbounded subcollection.
- `players/{uid}` and `aliases/{guestUid}`: identity/consent/activity. Old anonymous sessions cannot keep accessing a destination account after claim.
- `claims/{hash(secret)}`: short-lived, single-destination guest-ownership claim. Destination must have verified email identity.
- `audioGrants/{hash(secret)}`: opaque media access expiring in at most five minutes or at challenge closure. No spelling in filenames/URLs returned to the client.
- `launchInterest/{hash(normalizedEmail:platform)}` and `withdrawalTokens/{hash(secret)}`: independent explicit notification purpose. Duplicate signup does not extend expiry. Withdrawal invalidates related tokens.
- `events/{hash(idempotencyKey)}`: consented local optional events only; no names/emails/answers/share tokens.
- `history/{attemptId}`: own saved history after the challenge’s 90-day lifetime, no other player identifiers.
- `deletionJobs/{uid}` and `notificationOutbox/{id}`: deletion/recovery instructions and unsent inactivity-warning work. No real email delivery configured.

Direct web/mobile SDK reads/writes to Firestore and Storage are denied. Server handlers check authentication, ownership, deadlines, deleted identities, input bounds, and rates. Current list views cap history at 50 and standings at 100; extended cursor pagination is a production follow-up for larger populations.

## Owner review still needed

- Confirm the disclosed audio-only initial release, or specify the scope of a hearing-accessible mode. Local implementation can be reviewed either way.
- Confirm who maintains the word bank; the words and recordings themselves have now been approved.
- Review the visual design and play flow. Request changes before any deployment approval.

## Production gates (no changes made)

- Register the actual Firebase web app; initialize and verify Anonymous/email-link Auth and authorized domains; provision/check the audio bucket; deploy restrictive rules and indexes only after review.
- Add production App Check provider/verification, real configured frontend, protected audio delivery, and error handling for paused services. Remove local-only controls/guards only in a deliberate production release.
- Select the notification mechanism and verified sender for actual launch/inactivity emails. Ensure warning delivery is acknowledged before inactivity deletion. No sender credentials are needed for local signup tests.
- Implement the separately reviewed optional server-to-GA delivery path and analytics deletion requests; verify consent, measurement ID, two-month retention/reset-off, and D1/D7 reporting in the actual property. Local Firestore events are not a production analytics integration or reporting dashboard.
- Configure/check seven-day daily backups, restore/deletion replay, provider logging retention, budget controls, and regional configuration. No actual backup/restore or budget enforcement was changed by this implementation.
- Reconcile longer-lived data restoration with minimal deletion instructions; exercise restore before exposing data. The local cleanup tests are not proof of production disaster recovery.
- Add 30-days-after-launch signup cleanup tied to actual per-platform send confirmations. Current local signup retention enforces the 12-month maximum; no launch has occurred.
- Expand bounded history/standings into cursor pagination as needed; verify load/rate limits for launch volume.
- Perform actual iOS/Android audio checks in addition to the tested desktop browser and mobile viewport layout. Verify external privacy/support links and publish the final accurate privacy notice with an effective date.
- Obtain Curtis’s approval for the concrete release. No deployment, production seed, production app creation, or production rule change is authorized by the local-review task.

## Rollback preparation

Before the first approved deployment: retain a versioned prior Hosting release, Function artifact/configuration, and rules/index manifest; avoid destructive schema migrations; take/verify a recoverable backup before any production data migration. A rollback procedure must reapply deletion instructions before restored data is exposed. Existing production deny-all Firestore rules remain unchanged by local work.
