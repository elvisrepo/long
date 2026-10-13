# Stretching & Posture Tracking

## First slice (2026-10-09)

The authenticated Stretching & Posture page has two phase tabs: Lower body & hips
and Upper body & posture. Each shows a shared ordered starter list, a selected
local calendar date, daily checkboxes, and per-phase completion counts. Check-offs
are saved immediately and are private to the account. This slice has no routines
or timers. Short exercise cues and dose labels are general reference material,
not individualized medical recommendations.

The starter names, dose labels, cues, and 19 exercise illustrations are based on
the user-provided `stretches.pdf` source. The user confirmed the source is free to
reuse. Images are optimized 640×480 WebP static frontend assets; they are not
stored in the database. The source has no illustration for lower-body Foam
Rolling, so that exercise uses an original generated illustration. The cues are
general reference material, not individualized medical recommendations. The
source's toe-touch/spinal-disc warning is attributed to the source in the cue.
Migration `0004_source_cues` updates the shared catalog descriptions for existing
installations as well as fresh seeded catalogs.

Users can hide individual shared exercises or turn off the shared catalog for
their account. This changes visibility only: shared catalog rows and past
check-offs remain intact. The management dialog lists hidden exercises so users
can restore them.

Users can create private stretches with a title, phase, instructions, suggested
dosage, and optional illustration. They can edit and archive/restore these entries;
archive hides the exercise from new daily check-offs but retains existing history.
Custom entries are visible only to their owner, and built-in visibility preferences
cannot target custom records. Image data is never stored in PostgreSQL: uploads are
validated JPEG/PNG/WebP (2 MB maximum), normalized into consistent 640×480 WebP,
and stored under `stretching/{user_id}/{exercise_id}/...` in private S3. The database
stores only the object key; reads stream through an authenticated, owner-scoped API
route with `private, no-store` caching. Local DEBUG
uses Django media storage. Production image uploads return `503` until
`STRETCH_IMAGE_BUCKET` is configured. Account export includes custom stretch text
and object key metadata; deleting the account cascades custom rows and schedules
their objects for deletion after the transaction commits.

Shared and user-owned catalog records live in `StretchExercise`; personal daily
check-offs live in `StretchEntry`, unique by user, exercise, and date. Per-user
shared-catalog visibility is stored in `StretchPreferences`. The API uses JWT
identity, owner-scoped CRUD and history, includes owned metadata in account export,
and relies on the user foreign key cascade for account deletion. See
`03-api-design.md` for routes and contracts.

## Reference

- https://tr-70d.pages.dev/#stretching (reviewed 2026-10-09)
