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
The object key is first written to the `StretchImageCleanup` transactional
outbox, so an S3 outage does not lose the cleanup work. Unreferenced uploads
are deleted directly first, avoiding a database dependency during rollback
cleanup. The operator can retry queued deletions from the backend container with
`uv run python manage.py retry_stretch_image_cleanup`; failed keys remain
queued, never-attempted keys are prioritized over retries, and successful keys
are removed. This retry is not automatically scheduled in staging yet.

The AWS bucket, prefix-scoped EC2 role permissions, runtime secret setting, and
Nginx upload limit are captured in the current verified staging snapshot,
[`v019-stretch-image-storage-configured.dsl`](diagrams/current_aws/v019-stretch-image-storage-configured.dsl).
The API-to-S3 request path remains unverified until the application release is
deployed and exercised on staging.

Shared and user-owned catalog records live in `StretchExercise`; personal daily
check-offs live in `StretchEntry`, unique by user, exercise, and date. Per-user
shared-catalog visibility is stored in `StretchPreferences`. The API uses JWT
identity, owner-scoped CRUD and history, includes owned metadata in account export,
and relies on the user foreign key cascade for account deletion. See
`03-api-design.md` for routes and contracts.

## Compact checklist (2026-10-20)

The approved A layout groups the selected date and daily record count above a
seven-day history strip. Full date navigation remains available outside that
strip. History counts include hidden and archived exercises, while phase tabs
show visible exercises as “logged · available”; catalog size is not a daily target.
The week is anchored to today and uses the existing bounded entries endpoint.
History has independent loading/error/retry states so it cannot block daily logging.
Confirmed check-offs invalidate both daily and weekly entries.

Exercise rows use contained thumbnails, visible dosage labels and expandable
instructions. Image enlargement remains separate from check-offs. The full
existing reference cues are preserved. The list uses one column below 1000px and
two on desktop, with both phase choices side by side on narrow screens.

Management separates Built-in, Custom (active) and Archived tabs, with collapsible
phase groups for built-ins. Existing hide/show, edit, archive and restore actions
remain available and preserve history. New custom stretches start in the selected
phase, with Title first and optional instructions, dosage and image fields.
No API contracts, routes, routines, timers or exercise prescriptions changed.

## Reference

- https://tr-70d.pages.dev/#stretching (reviewed 2026-10-09)
