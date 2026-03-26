# Exercise Types

Use one pattern per exercise.

## Prediction

Use when the user has just changed behavior and should predict the outcome before seeing it.

Good for:
- auth request flows
- CSRF behavior
- CI behavior
- deployment assumptions

Prompt shape:
- ask what they think will happen in one concrete scenario

## Trace The Path

Use when the value is understanding a request, token, task, or data path step by step.

Good for:
- login, refresh, logout
- request lifecycle
- CI run flow
- local-to-MVP architecture mapping

Prompt shape:
- ask what happens next at one step in the path

## Debug This

Use when a realistic failure mode or edge case is more educational than the happy path.

Good for:
- stale route references
- wrong CSRF handling
- broken CI assumptions
- deployment diagram mistakes

Prompt shape:
- ask what would break and why

## Teach It Back

Use when the user has already seen the code and should explain it in their own words.

Good for:
- auth transport split
- why local runtime and MVP target are different
- why a C4 view includes some elements and excludes others

Prompt shape:
- ask them to explain it as if onboarding a new developer

## Compare Alternatives

Use when the learning value is in tradeoffs rather than pure execution flow.

Good for:
- cookie vs body-token auth transport
- local runtime vs deployment target
- C4 vs other architecture notations

Prompt shape:
- ask why one design was chosen over a plausible alternative
