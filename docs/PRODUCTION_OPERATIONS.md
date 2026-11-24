# Production operations

## Release authorization and cost

Curtis explicitly authorized production deployment/content upload and subsequently approved the narrow runtime/audio-reader grants. Keep the $25 monthly budget/alerts and $25 Functions cap unchanged. No additional paid provider has been added. Runtime is keyless and limited to Firestore data access, three Auth user lifecycle permissions, and audio-prefix read access.

## Analytics

GA4 property 561353528, stream 16234126457, measurement ID G-KD4SX4G1TH. The console was checked: Hosting URL saved; both retention settings two months; reset on activity disabled. Enhanced measurement is off. Analytics SDK loads only after opt-in; page URLs/referrers are sanitized so challenge links and email-link tokens are not sent. No names, email addresses or typed answers are analytics event fields. GA uses a SHA-256 identity pseudonym only after consent.

Use `node scripts/analytics-report.cjs` to produce `artifacts/production-review/analytics-report.json`. The authoritative Firestore event report includes consented visits/repeats, starts, completions, word-position submissions, invitation intent, attributed friend starts, average sharing activity and matured UTC D1/D7 cohorts. Reports cover consenting identities only, over the 60-day raw window. A share click is not proof of a sent invitation. Cross-device anonymous visitors cannot be counted as a single human with certainty. Client GA events can be blocked or duplicated by retries; canonical completion counts come from transactionally recorded Firestore events.

Deletion: app deletion queues `analyticsDeletionJobs/{pseudonym}` as pending-provider. The operator must process the pseudonym through Google Analytics' supported user-deletion workflow, record provider acknowledgement and then remove the instruction after the backup/deletion replay window. Do not claim provider-controlled analytics deletes within the app's seven-day live-data guarantee. Historical analytics deletion/withdrawal requests can also arrive at runtimesquad@gmail.com. No Analytics credentials belong in frontend config.

## Email operations without a new provider

Firebase Auth sends requested sign-in links; use its default managed sender. Verify the real link manually on the live domain after deployment (an operator's own browser/email, no passwords or links pasted into chat). Do not send launch notifications during release verification.

No external paid email provider is configured. Inactivity warnings use the operator-reviewed `notificationOutbox` workflow. The daily maintenance job queues due warnings; the operator checks this queue regularly and sends the account owner a transactional warning through the existing support mailbox. Resolve the actual current Auth address only when preparing a due notice; do not copy addresses into logs or analytics. Warning copy must identify the inactive Spell-Bee account, state the proposed date at least 30 days ahead, explain that signing in or playing cancels inactivity deletion, and link to the live app/support. Do not send newsletters or launch marketing in these warnings.

After actual delivered-warning evidence, record `warningForLastActiveAt` matching the current `lastActiveAt` and `inactivityWarningSentAt` on the player. If activity changed or delivery bounced, do not acknowledge it. Maintenance rechecks activity and waits for at least 30 days after that timestamp before deletion. If no delivered warning is acknowledged, inactivity deletion remains blocked and the account is retained; an outbox record alone is never delivery. This manual no-new-provider mechanism must remain in the support runbook until an explicitly approved automated sender replaces it. Newly launched accounts cannot be due for a 24-month inactivity deletion at launch.

Launch requests remain unsent. Before an operator sends a platform-specific launch message, verify the signup is still subscribed and unexpired, then record sent time and expire it 30 days later or at the original 12-month maximum, whichever is earlier. Withdrawn entries must never be sent. A future delivery provider/cost needs Curtis's approval.

## Recovery and deletion replay

Daily managed Firestore backups are configured for seven-day retention; operational `_Default` logs for 30 days. Provider-required audit logs can have their own retention. A schedule is not proof of a completed backup or managed restore. Check the first scheduled backup completes after launch and perform a managed restore drill into an isolated recovery destination only with approval; no staging project/database is to be created silently.

Before exposing any restored snapshot: keep access denied/maintenance mode, overlay the newest restricted deletion instructions from the live system, block restored deleted identities, replay idempotent deletion, recheck link/guest/event/signup expiry, and verify deleted records and aliases are gone. Do not reopen access until those checks pass. Local release tests serialize a snapshot, delete its identity, restore the snapshot, replay retained deletion instructions, and assert the restored player/attempt are gone. This validates app replay behavior, not Google's disaster recovery system.

Keep completed deletion instructions for the seven-day backup window. When initiating a managed restore, capture current instructions before replacing data, and never overwrite that overlay with the older backup copy. Do not restore Auth exports from Firestore backups. Keep approved static word/audio source and checksum manifest separately; no test fixture is part of production recovery.

## Rollback

Keep `dist-production`, Functions source, lockfiles, configuration, rules/indexes and content-manifest checksum evidence for each release. Roll back Hosting to its prior version in the Firebase console/CLI; on the first release use a maintenance landing page if there is no previous playable release. Redeploy the preceding reviewed Functions revision without reverting personal data/deletion jobs. Never use emulator exports as a production migration. Keep test data on demo emulators.

## Live checks

Check HTTPS home and challenge deep links, guest entry, protected MP3 delivery, denied direct Firestore/Storage reads, rejection of missing Auth/App Check, disabled preview endpoints, optional consent, and email-link return. Device audio still needs physical iOS/Android review if those devices are unavailable to automation. Launch notifications are never a smoke test.
