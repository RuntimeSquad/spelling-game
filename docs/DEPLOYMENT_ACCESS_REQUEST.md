# Deployment access request

Curtis authorized the approved content upload and production deployment, with no new paid providers or budget increases. Curtis explicitly approved the exact narrow grants below; they were applied/read back. The content upload and game deployment subsequently completed. The remaining text records the original request and intermediate state.

## Keyless runtime identity

Proposed new identity: `spellbee-runtime@spell-bee-c218a.iam.gserviceaccount.com` in project `spell-bee-c218a`. No keys will be generated.

- Project role `roles/datastore.user`: read and write game records in the sole production Firestore project.
- Custom project role `spellbeeUserLifecycle`: only `firebaseauth.users.get`, `firebaseauth.users.update`, and `firebaseauth.users.delete`, needed for account claims, disabling access, and approved deletion. No Authentication configuration/IAM administration.
- Bucket-only `roles/storage.objectViewer`, conditioned to `audio/` in `spell-bee-c218a.firebasestorage.app`: read the approved recordings for protected audio delivery. No audio upload/update/delete for runtime.

Machine-readable proposal: `config/runtime-access-request.json`. The initially proposed broader `roles/firebaseauth.admin` grant was rejected by automatic approval review and was not performed. The executable broad-IAM branch has been removed.

## Release operator read permission

Signed-in Firebase operator `curtiscolly@gmail.com` can create Storage objects but cannot get/update their contents or metadata. The upload therefore cannot perform its required checksum readback.

Proposed additional permission: bucket-only `roles/storage.objectViewer`, conditioned to `audio/` in the same bucket. No project-wide Storage Admin role and no permission to make data public. Existing create permission is sufficient for the corrected atomic create-only uploader; metadata-update permission is no longer requested.

## Current verified progress

- Daily Firestore backup schedule created/read back with retention `604800s` (seven days).
- `_Default` operational log bucket verified with `retentionDays: 30`.
- Production build passed; seven domain/runtime-safety tests passed.
- Guarded content uploader validates every local approved word/audio asset before writes and imports no users, attempts, or emulator data.
- Initial upload created `audio/word-001.mp3` but could not attach metadata afterward. Corrected uploader creates metadata atomically, and will verify that existing first object by bytes before proceeding; if it differs, it refuses replacement. No `words` documents were written by the failed uploader.
- Content upload, IAM setup, analytics completion, email operations, restore/deletion replay drill, final integration checks, deployment and live verification remain unfinished. A backup schedule is not proof of a successful managed restore.

After explicit approval of the recipients and permissions above, apply and read back the narrow grants, complete remaining engineering gates, deploy, and run scoped production smoke checks. Do not bypass missing access by making the bucket public or disabling rules/App Check.
