# Stretching & Posture Tracking

## First slice (2026-10-09)

The authenticated Stretching & Posture page has two phase tabs: Lower body & hips
and Upper body & posture. Each shows a shared ordered starter list, a selected
local calendar date, daily checkboxes, and per-phase completion counts. Check-offs
are saved immediately and are private to the account. There are no routines,
timers, instructions, medical recommendations, images, or custom exercise editing
in this initial slice.

The lower-body starter labels mirror visible exercise names from the supplied
reference page. The upper-body set is a generic starter list because the
reference's upper-body details were not available for verification. The user
identified the source as a free online article but had no reuse-rights information;
therefore its illustrations and prose are not copied. Revisit the catalog if the
user provides an explicit license or independently authored content.

Shared catalog records live in `StretchExercise`; personal daily check-offs live
in `StretchEntry`, unique by user, exercise, and date. The API uses JWT identity,
provides owner-scoped history, includes entries in account export, and relies on
the user foreign key cascade for account deletion. See `03-api-design.md` for
routes and contracts.

## Reference

- https://tr-70d.pages.dev/#stretching (reviewed 2026-10-09)
