## 8. Initial Project Status, Workflow, and Automation Notes

## Use When
- Load this when you need the first concise project checkpoint, how we have been implementing slices, what is deferred, and what to automate next.

## Source
- Derived from the current repo state and the auth implementation work completed in this chat.

### Current Project Snapshot

- The project is still backend-first. There is no React frontend scaffold in the repo yet.
- The implemented backend code is currently concentrated in:
  - `backend/apps/users/`
  - `backend/common/`
  - `backend/config/`
  - `backend/tests/`
- The backend uses Docker locally and has `uv.lock`, but there is currently no GitHub Actions workflow in `.github/`.
- The backend `pyproject.toml` includes `pytest`, `pytest-django`, and `ruff`, but there is no configured type-checking, pre-commit, security scan, or CI pipeline yet.

### What Is Done

- Custom Django user model exists.
- Email is stored encrypted at rest and supported by `email_lookup_hash` lookup logic.
- Custom auth backend supports email + password login.
- Register endpoint works.
- Auth transport is now split explicitly:
  - web login, refresh, logout
  - mobile login, refresh, logout
- Web auth is hardened:
  - refresh token in `HttpOnly` cookie
  - CSRF bootstrap endpoint
  - CSRF required on web refresh/logout
- Mobile auth is explicit-token based:
  - refresh and logout use request-body refresh token submission
- `me` endpoint works with bearer access token auth.
- Refresh token rotation and blacklist are in place.
- Full backend suite is green at this checkpoint: `37 passed`.

### What Is Not Done Yet

- Password reset is still deferred.
- Profile update and account/account-deletion flows are still deferred.
- Email verification is not implemented.
- No richer user-profile domain exists yet beyond auth basics.
- No frontend app exists yet.
- No CI/CD pipeline exists yet.
- No lint/type/security automation is wired yet.

### How We Implemented The Backend Slice

- We worked in vertical slices, not in broad refactors.
- We used TDD in the project’s intended loop:
  1. list the next scenarios
  2. write one failing test
  3. implement the minimum code to pass it
  4. rerun focused tests
  5. refactor only on green
  6. rerun the broader suite
  7. update `reference_docs`
  8. commit
- We stayed mostly at the API boundary for auth work:
  - `pytest`
  - `pytest-django`
  - DRF `APIClient`
- We used the backend as the source of truth and let tests force the contract:
  - cookie transport
  - CSRF enforcement
  - route split
  - JSON response shape

### What We Learned

- Ambiguous transport contracts are a security and maintenance problem.
- Cookie-based browser auth needs CSRF as a first-class concern.
- SimpleJWT handles token mechanics well, but transport and browser security are still application responsibilities.
- Updating implementation without updating canonical docs causes drift quickly.
- Route/path changes should always be followed by a grep for stale references before the full test run.

### AGENTS.md Review

Current `AGENTS.md` is already useful. It has the right general tone and it correctly pushes:
- honesty
- TDD
- minimal code
- type hints
- project-specific doc routing

What was missing and is worth codifying:
- when changing API contracts or route paths, update the canonical docs in the same slice
- after changing route names, grep for stale references before running the broad suite
- prefer focused test runs first, then the full suite
- when adding a new knowledge doc that should be reused later, add it to `AGENTS.md` routing

### Reference Docs Review

The `reference_docs/knowledge/` folder is strong. It already acts like a project memory system.

What is working well:
- domain, architecture, auth, testing, and roadmap concerns are already separated
- the auth work in this chat was documented as we went
- the docs are specific enough to guide implementation

Main risk:
- drift between implementation and canonical API docs

Rule to keep:
- if code changes the public contract, update:
  - `03-api-design.md`
  - the relevant domain/security doc such as `14-auth-strategy.md`
  - `21-testing.md` if tests or test strategy changed

### Recommended Automation Loop

Use this as the default slice workflow:

1. Choose one slice.
2. Write the scenario list.
3. Add one failing test.
4. Implement until focused tests pass.
5. Refactor on green.
6. Run the full relevant suite.
7. Update reference docs.
8. Commit.
9. Move to the next slice.

Do not skip steps 6 and 7. They are where regressions and documentation drift are caught.

### Linting, CI/CD, and Automation

Recommended next automation additions:

- Add a `Makefile` or `justfile` with stable commands:
  - `test`
  - `test-auth`
  - `lint`
  - `typecheck`
  - `docs-grep`
- Add `ruff` configuration and make linting mandatory.
- Add `mypy` or `pyright` for production code type-checking.
- Add `bandit` and `pip-audit` to security automation.
- Add `pre-commit` so formatting/linting runs before commits.
- Add GitHub Actions for:
  - lint
  - tests
  - security scans
  - optional docs consistency checks

Recommended CI order:
1. install dependencies
2. lint
3. type-check
4. run focused fast tests
5. run full backend tests
6. run security checks

When to add CI vs CD:
- add CI now, before the frontend slice grows
- CI should become the default quality gate for backend changes immediately
- expand CI later to include frontend once the first React slice exists
- add CD only after the deployment shape, secrets handling, and release flow are stable enough
- do not rush CD before the project has a reliable test and lint gate

### Logging and Observability

Basic logging is not too early.

Good to add now:
- structured backend logs
- request and error logging
- auth/security-relevant event logging
- clear Docker-local log output

Too early right now:
- full observability stack
- centralized log aggregation
- uptime alerting
- heavy dashboarding

Practical sequencing:
- add basic structured logging now
- add CI next if it is not already in place
- add richer monitoring later when the frontend exists and deployments are becoming routine

### Reviewer / Agent Workflow

For this repo size, one main coding agent is enough most of the time.

A useful multi-agent workflow later would be:
- Main agent:
  - owns the slice
  - chooses the next test
  - integrates final code
- Explorer agent:
  - answers narrow codebase questions
  - finds impacted files and stale references
- Worker agent:
  - implements one isolated code change
- Reviewer agent:
  - read-only review for bugs, regressions, missing tests
- Docs agent:
  - updates `reference_docs` after the code is stable

Best orchestration pattern:
- main agent keeps the critical path
- explorer/reviewer/docs work in parallel on side tasks
- do not delegate the immediate blocking implementation step unless the write scope is clearly isolated

### Should We Add More Agents Right Now

- Not as a first priority.
- Better automation and better command wrappers will help more than more agents right now.
- Add multi-agent orchestration once:
  - frontend exists
  - CI exists
  - there are enough parallelizable tasks to justify it

### Testing Review

Current auth/backend testing is not excessive.

Why it is reasonable:
- auth is security-sensitive
- transport behavior changed several times
- cookie + CSRF flows are easy to get subtly wrong
- integration tests are the right level for these contracts

What not to over-test:
- SimpleJWT internals
- Django/DRF internals
- implementation details behind public endpoint behavior

Good next backend tests later:
- auth rate limiting
- cookie flag assertions where practical
- blacklist behavior edge cases
- future password-reset flows

### pytest Functions vs Django TestCase

Do not refactor these tests to `django.test.TestCase` just for the sake of it.

Current choice is better:
- `pytest` function tests are concise
- fixtures and `APIClient` are already enough
- the current suite is easy to read

Use `TestCase` classes only when they provide real value, for example:
- heavy shared setup
- class-level fixtures that materially reduce repetition
- Django-specific lifecycle behavior that is clearer in class form

For now:
- keep pytest function-style tests
- add helper fixtures before introducing class-based tests

### Type Hints

- Keep adding Python type hints in production code.
- Helper functions and non-trivial view helpers should be typed.
- Full typing of tiny pytest test functions is optional and low priority.
- Type-checking automation matters more than adding annotation noise everywhere.

### How To Inspect Actual API Responses

Use at least one direct HTTP tool in addition to automated tests.

Good options:
- `curl`
- `httpie`
- Postman
- Bruno
- Insomnia
- browser devtools for the web flow

For this project, `curl` or `httpie` is enough initially.

Examples worth checking manually:
- web login response headers and cookies
- csrf bootstrap response
- web refresh with cookie jar + `X-CSRFToken`
- mobile login JSON response shape

### Recommended Next Step

- Add backend CI with lint, type-checking, tests, and security checks.
- Scaffold the React frontend with Vite.
- Implement the web auth flow first:
  - `GET /api/auth/csrf/`
  - `POST /api/auth/web/login/`
  - in-memory access token
  - `GET /api/auth/me/`
  - `POST /api/auth/web/refresh/`
  - `POST /api/auth/web/logout/`

Do not start with dashboard UI before this auth path works end to end.
