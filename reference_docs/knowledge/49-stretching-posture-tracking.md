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

Shared catalog records live in `StretchExercise`; personal daily check-offs live
in `StretchEntry`, unique by user, exercise, and date. The API uses JWT identity,
provides owner-scoped history, includes entries in account export, and relies on
the user foreign key cascade for account deletion. See `03-api-design.md` for
routes and contracts.

## Reference

- https://tr-70d.pages.dev/#stretching (reviewed 2026-10-09)
