# Spell-Bee production preparation — October 29, 2026

Status: DEPLOYED to https://spell-bee-c218a.web.app under Curtis’s explicit deployment/content authorization and subsequent narrow-IAM approval. The historical preparation notes below are superseded by the release result here.

## Deployment result — October 29, 2026

- Approved keyless runtime created and verified: `roles/datastore.user`, custom Auth user get/update/delete only, audio-prefix Storage read. The operator received only the approved audio-prefix read grant. No keys, broad Auth Admin/Editor/Owner grants, new paid providers or budget increases.
- Uploaded/verified 100 approved words and recordings, including byte-for-byte MP3 checksums. No emulator users, attempts or exports imported.
- Deployed restrictive Firestore/Storage rules, ready composite indexes, 19 ACTIVE Node 22 Functions using the approved runtime identity, and Firebase Hosting. Emulator preview endpoints are absent from the production manifest.
- Daily maintenance schedule enabled and a normal production run requested. Seven-day daily Firestore backups and 30-day `_Default` log retention verified. Artifact Registry image cleanup set to seven days after the initial backend CLI reported cleanup-policy setup incomplete; Functions themselves had all deployed successfully.
- GA console: production stream URL saved, user/event retention two months, activity reset disabled. Client collection is opt-in, URLs/referrers sanitized, no raw identifiers/names/emails/answers in event properties. Canonical reporting uses consented Firestore events; the reporting command is implemented and read-tested. Provider-controlled historical deletion is an operator-acknowledged workflow, not an app-wide seven-day guarantee.
- Final checks: eight unit/runtime/report tests; 25 demo-emulator integration scenarios, including local restore/deletion replay; production build passed. Readback verified 19 ACTIVE Functions with the expected identity and READY indexes. HTTPS home/deep-link shell 200; direct answer-bank/audio reads 403; unauthenticated/App-Check-less callable 401.
- Live browser: guest initialization, word prompt, definition and answer field loaded; actual protected audio playback had readyState 4, finite duration and no media error. Before opt-in, no googletagmanager script was loaded. Saved screenshot and test evidence are under ignored `artifacts/production-review/`.
- Honest follow-ups: owner must open an actual account sign-in email and test physical iOS/Android audio. A first managed backup must complete before an actual cloud restore can be tested; the completed local replay drill does not claim that cloud disaster recovery was exercised. Inactivity warnings use the existing support mailbox/operator workflow, and inactivity deletion is blocked until delivered-warning acknowledgement plus 30 days. Launch notifications remain unsent. See `docs/PRODUCTION_OPERATIONS.md`.


## Verified setup follow-up

- Registered `Spell-Bee Web`, app ID `1:704864382098:web:d941a4b4472edd62978a4b`.
- Initialized Auth; enabled Anonymous and email sign-in with `passwordRequired=false` (email links permitted). Authorized `spell-bee-c218a.web.app` and `spell-bee-c218a.firebaseapp.com`. No users created or emails sent.
- Created default bucket `spell-bee-c218a.firebasestorage.app` in `US-CENTRAL1`; verified empty, uniform bucket-level access and public access prevention enforced. Published and read back deny-all Storage rules for this new bucket. Firestore rules unchanged.
- Enabled and read back required Functions, Cloud Run, Build, Artifact Registry, Scheduler, Storage, App Check and reCAPTCHA Enterprise APIs and their provider-managed dependencies. No budget amounts changed.
- Registered a SCORE reCAPTCHA Enterprise key restricted to both Hosting domains and registered it with the web app's App Check configuration; one-hour tokens, returned minimum score 0.5. Live token exchange/enforcement smoke tests await an approved deployment. No production debug token configured.
- Retrieved public Firebase SDK configuration, prepared ignored environment files, and built the candidate successfully with `npm run build:production`. Output is `dist-production/`, separate from the local review build. `firebase.production.json` points to that directory.
- Fresh readback: Auth HTTP 200, bucket HTTP 200, Functions HTTP 200 with no functions returned. No game code, Hosting release, Functions, Scheduler job, approved audio, word-bank data, test users or attempts deployed/uploaded.
- No owner console work is currently required for this Firebase setup step. Analytics authorization, inaccessible budget verification and real sender verification may still need owner assistance if engineering cannot resolve them through existing access. Bank-maintainer/audio-only decisions are now recorded as approved in the roadmap and must not be reopened.
- Local readback evidence is ignored by Git under `artifacts/production-review/`. Inspection scripts strip Auth password-hash configuration and SMTP configuration before saving evidence. No service-account keys are used.

The initial inspection findings below are historical; the setup follow-up above supersedes missing-resource findings and the earlier build-blocker status.

Proposed live URL: https://spell-bee-c218a.web.app (existing default Hosting site; this inspection does not establish that the game is live).

## Verified cloud state

Read-only Firebase CLI and authenticated Google APIs inspected project `spell-bee-c218a`. Evidence: `artifacts/production-review/inspection.json` (local account metadata; do not publish as a web asset).

| Item | Evidence |
|---|---|
| Billing | Billing enabled. Recorded $25 monthly budget and $25 Functions cap retained. Neither setting independently verified: Budget API returned SERVICE_DISABLED for the CLI's consumer project; no change made. A budget is not a project-wide cutoff; Functions cap does not cover other services. |
| Firestore | Native `(default)`, `nam5`; production rules deny all client reads/writes. PITR disabled; deletion protection disabled. |
| Backups | No backup schedules returned. Seven-day daily backup/restore validation remains required. |
| Hosting | Default site `spell-bee-c218a`, URL above. |
| Web apps | Firebase CLI `apps:list` returned an empty list. |
| Auth | Admin configuration returned 404 CONFIGURATION_NOT_FOUND. Anonymous/email-link providers and authorized domains are not ready. |
| Storage | Bucket list empty. No audio bucket exists. |
| Functions | API disabled; no successful function inventory. |
| Required APIs | Firestore, Hosting, Rules, Identity Toolkit, Storage and Text-to-Speech enabled. Functions, Cloud Run, Cloud Build, Artifact Registry, Scheduler, App Check and reCAPTCHA Enterprise were absent from the enabled-service list. Enable only the required dependencies during approved provisioning. |

## Prepared release configuration

- `firebase.production.json`: existing Hosting site, static `dist-production`, SPA challenge-link rewrites, `/api/audio` -> `audio` in `us-central1`, security headers, restrictive Firestore/Storage rules, indexes, Node.js 22 Functions.
- `nam5` Firestore with `us-central1` Functions; audio bucket proposed in `us-central1`. Verify the allocated bucket's actual name rather than assuming an appspot name.
- Callable handlers: zero minimum instances, maximum two instances per function, concurrency 20, 256 MiB, 30-second timeout, App Check enforced in production. These settings are per function, not a shared $25 ceiling. Audio has maximum two instances; daily maintenance maximum one.
- Backend defaults fail closed: production requires exact project `spell-bee-c218a`, `SPELLBEE_RELEASE=production`, and verified `SPELLBEE_STORAGE_BUCKET`. Emulator mode still requires demo project and loopback emulator hosts. Preview maintenance/closure handlers reject production execution; preview controls are hidden from the release UI.
- Frontend: explicit `production-release` mode, exact production project, registered web config, reCAPTCHA Enterprise App Check, no emulator connections or local email-link preview in production. Real email-link sending uses Firebase Auth.
- `npm run build:production` refuses missing web configuration/App Check key. Populate `.env.production-release.local` with `VITE_FIREBASE_CONFIG` (JSON public Firebase web configuration) and `VITE_APPCHECK_SITE_KEY` (public site key). Never use service-account secrets in Vite variables.
- Backend deployment environment: `functions/.env.spell-bee-c218a` containing `SPELLBEE_RELEASE=production` and `SPELLBEE_STORAGE_BUCKET=<verified bucket>`. No provider credentials in files/source. Cloud runtime uses managed identity; review least-privilege IAM before release.
- `.firebaserc` default remains `demo-spell-bee`; normal build stays a loopback-only review build; `npm run deploy` remains blocked. Existing seed script explicitly refuses production. Production seed requires a separately reviewed tool that uploads only the approved word bank and recordings, never emulator exports or test players.

## Remaining release gates

Engineering work before asking for deployment approval:

1. Provision/register web app, Auth config (Anonymous and email-link), production authorized domains (`spell-bee-c218a.web.app`, `spell-bee-c218a.firebaseapp.com`), audio bucket, required APIs, and App Check Enterprise site/app registration. Record resulting public configuration. These are staged requirements, not completed changes.
2. Verify $25 budget alerts and existing $25 Functions spend cap in the console or through an accessible API. Do not ask Curtis to choose the amounts again. Do not enable unrelated APIs in the CLI-owned consumer project to bypass an inspection limitation.
3. Review runtime IAM and deployment principal permissions, disable unused providers, configure Auth sender templates and verify real email-link sign-in/claim flow after approved release. Enable only the listed service dependencies.
4. Prepare guarded production content upload with manifest/checksums, opaque private audio paths and no Firebase download tokens. Approved en-US-Standard-C recordings are already generated; runtime synthesis is unnecessary.
5. Implement/verify production analytics delivery and reporting/deletion, or explicitly approve postponing analytics and remove its collection controls/claims. Current Firestore event recording is not a GA integration. Analytics linkage remains unverified.
6. Finish privacy notice for actual production behavior/effective date. Existing notice and settings still contain local-review limitations. Preserve the 90-day challenge-link disclosure and approved retention periods. Verify support contact and ages-13+ audience decision from roadmap before launch.
7. Configure daily backups with seven-day retention, provider log retention, restore/deletion replay; exercise recovery. Current cloud state has no schedule. Inactivity-warning outbox intentionally cannot trigger automatic account deletion until delivered warning is recorded; actual sender/delivery is unresolved. Launch notifications remain launch-only and unsent; implement per-platform send confirmation and 30-day post-launch cleanup before sending.
8. Device audio QA on actual iOS/Android, abuse/load checks (per-identity rates do not prevent unlimited fresh anonymous identities), public URL deep links, paused-service behavior, and post-deploy App Check/Auth tests. Capture rollback artifacts before release. Public store badges and mobile signup flow need final store-branding review for a coming-soon product.

Curtis input, if not already recorded in the roadmap: word-bank maintainer; approval of audio-only initial release; final privacy/audience/support details; whether analytics can be deferred if its integration is not ready. These decisions do not block independent engineering work above. No new credentials should be pasted into chat.

## Deployment approval scope, once gates pass

Present the final artifacts and checks before asking Curtis to approve a deployment. Proposed explicit release command (DO NOT RUN YET):

`firebase deploy --project spell-bee-c218a --config firebase.production.json --only firestore:rules,firestore:indexes,storage,functions,hosting`

Deploy order should separate backend/rules/content validation from Hosting publication. Avoid deleting existing resources; inspect deployed functions and Hosting versions first. Record immutable release artifacts plus rule/index/config versions. Roll back Hosting and Functions to reviewed artifacts; never restore deleted personal data without replaying deletion instructions. A fresh project has no previous app release to roll back to, so a deny-all maintenance landing page is the initial fallback.

Approval must cover actual cloud provisioning, initial approved-content upload, rules/indexes, Functions/Scheduler and Hosting release. Resource setup is now authorized and completed as described above. Game deployment/content upload still requires explicit deployment approval.


## Authorized deployment attempt — access blocked

Curtis subsequently authorized approved word/audio upload and production deployment, without new paid providers or increased budget. Daily seven-day backup schedule and 30-day operational logs are now configured/read back. Production build and seven unit/runtime tests pass. The game remains undeployed: runtime IAM was rejected by automatic approval review, and the release operator lacks private Storage object read permission for checksum verification. See `docs/DEPLOYMENT_ACCESS_REQUEST.md` for the precise narrower approval request and partial-upload state. Do not report deployment, analytics, email operations or full disaster recovery as complete.
