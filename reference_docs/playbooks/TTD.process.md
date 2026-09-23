# Test-Driven Development Process

## Use When
- Load this when implementing new behavior, fixing a bug, or changing behavior in a risky part of the system.

## Source
- Martin Fowler, Test Driven Development: https://martinfowler.com/bliki/TestDrivenDevelopment.html
- Kent Beck, Canon TDD: https://tidyfirst.substack.com/p/canon-tdd

## What TDD Means Here

TDD is not "write all the tests first."

For this project, use the canonical loop:

1. Write a list of test scenarios for the behavior change.
2. Turn exactly one scenario into one concrete, runnable test.
3. Change the code until that test and all prior tests pass.
4. Optionally refactor while the suite is green.
5. Repeat until the scenario list is empty.

The short version is still red, green, refactor, but the test list comes first.

## Core Rules

- Work one behavior at a time.
- Start from behavior, not implementation.
- Pick the smallest useful next test.
- Never make a test pass by weakening the assertion.
- Do not refactor while the test is still red.
- If you discover a new case while coding, add it to the test list.
- For bug fixes, reproduce the bug with a failing test first.
- Keep tests close to the public behavior being changed.

## How We Should Use TDD In This Project

This project is planned as vertical slices. TDD should follow the same shape:

- Start from the user-visible or system-visible behavior.
- Add the narrowest test that proves the next behavior.
- Implement only enough code to pass it.
- Refactor once green.
- Move to the next scenario.

Prefer tests at the boundary that best expresses the behavior:

- Models, validators, and pure services: unit tests.
- DRF endpoints and auth flows: integration tests with `pytest` and `APIClient`.
- Timescale queries, analytics, and user scoping: integration tests against the database.
- Webhooks, Celery tasks, and idempotency behavior: integration or service-level tests.
- Frontend flows: component tests where helpful, and Playwright for key user journeys.

## Suggested TDD Workflow By Area

### Auth

Build auth from request behavior outward.

Example scenario list:
- valid registration returns `201`
- duplicate email is rejected
- login returns token pair
- refresh returns a new access token
- login rate limit is enforced

Start with one happy-path test, then add the next failure mode.

### Metric Definitions and Metric Logging

Keep tests centered on domain rules and API behavior.

Example scenario list:
- default metric definitions are listed
- valid metric entry is created
- out-of-range metric value is rejected
- users cannot read another user's entries
- entries are ordered by `recorded_at DESC, id DESC`
- analytics cache is invalidated after write

Do not jump to analytics or caching tests before basic write and read behavior works.

### Analytics

Start with the simplest query behavior that matters.

Example scenario list:
- 7-day analytics returns expected aggregates
- 30-day analytics uses the correct range
- empty data returns a valid empty response
- cached result is reused on repeat read

Keep the first tests narrow. Add caching behavior only after correctness is proven.

### Stripe and Wearables

Use TDD heavily for idempotency and edge cases.

Example scenario list:
- valid signed webhook is accepted
- replayed webhook is ignored safely
- backfill job deduplicates entries
- invalid signature is rejected
- entitlement state updates correctly

### Frontend

For UI, drive from behavior rather than markup.

Example scenario list:
- dashboard shows latest metric cards
- log metric modal submits valid data
- failed API response shows validation error
- wearables screen starts connect flow

Use end-to-end tests for critical flows and avoid over-specifying presentation details in low-value tests.

## Picking The Next Test

Good next tests:
- unlock the next smallest bit of behavior
- reduce uncertainty
- force a useful interface decision
- keep the feedback loop short

Bad next tests:
- speculative tests for far-future behavior
- many nearly identical cases before anything passes
- tests that mostly restate implementation details

## Refactoring Rules

Only refactor on green.

Refactor to:
- remove duplication
- improve names
- separate interface from implementation
- move logic to a better boundary
- simplify setup and helper usage in tests

Do not use "refactor" as cover for unrelated redesign while still learning the behavior.

## Definition of Done For A TDD Step

A step is done when:
- the selected test passes
- all previous relevant tests still pass
- the code is clean enough for the next test
- any newly discovered scenarios have been added to the list

## What To Avoid

- writing a large batch of concrete tests before seeing anything pass
- asserting on private implementation details when public behavior is enough
- copying actual computed output into expected values just to make the test green
- skipping refactoring repeatedly and leaving behind hard-to-extend code
- treating coverage as the goal instead of behavior confidence

## Default Implementation Pattern

When implementing a feature in this repo:

1. Write the scenario list in the task notes or scratchpad.
2. Pick one scenario.
3. Write one failing test.
4. Make it pass with the smallest reasonable code change.
5. Refactor on green.
6. Repeat.

This is the default way to build backend behavior in this project unless there is a strong reason not to.
