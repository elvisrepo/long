# Stretching & Posture Tracking

## First slice (2026-10-09)

The authenticated Stretching & Posture page has two phase tabs: Lower body & hips
and Upper body & posture. Each shows a shared ordered starter list, a selected
local calendar date, daily checkboxes, and per-phase completion counts. Check-offs
are saved immediately and are private to the account. This slice has no routines,
timers, custom exercise editing, or image assets. Short exercise cues and dose
labels are general reference material, not individualized medical recommendations.

The starter names, dose labels, and short paraphrased cues for both phases are
based on screenshots supplied by the user. The source is a free online article,
but reuse rights are unknown; its photos and verbatim prose are not copied.
Medical claims from the screenshots are not repeated. Revisit visual assets if
the user provides an explicit license or independently authored illustrations.

Shared catalog records live in `StretchExercise`; personal daily check-offs live
in `StretchEntry`, unique by user, exercise, and date. The API uses JWT identity,
provides owner-scoped history, includes entries in account export, and relies on
the user foreign key cascade for account deletion. See `03-api-design.md` for
routes and contracts.

## Reference

- https://tr-70d.pages.dev/#stretching (reviewed 2026-10-09)
