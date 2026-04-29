## 8. Initial Project Status, Workflow, and Automation Notes

## Use When
- Load this when you need the first concise project checkpoint, how we have been implementing slices, what is deferred, and what to automate next.

## Source
- Derived from the current repo state and the auth implementation work completed in this chat.

### Current Project Snapshot

- The project is still backend-first, but a React frontend scaffold now exists.
- The implemented backend code is currently concentrated in:
  - `backend/apps/users/`
  - `backend/common/`
  - `backend/config/`
  - `backend/tests/`
- The implemented frontend code is currently concentrated in:
  - `frontend/src/main.tsx`
  - `frontend/src/routes/`
  - `frontend/src/routeTree.gen.ts`
- The backend uses Docker locally and now also has a working GitHub Actions backend CI workflow.
- The backend `pyproject.toml` now includes `pytest`, `pytest-django`, `ruff`, and `mypy`.

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
- Baseline console/stdout backend logging is now in place.
- Web login success is logged through `apps.users.views`.
- Full backend suite is green at this checkpoint: `37 passed`.
- Frontend stack direction is now explicitly chosen and scaffolded:
  - Vite
  - React + TypeScript
  - TanStack Router
  - TanStack Query
  - Zod
  - shadcn/ui
  - Tailwind CSS
  - ESLint + Prettier
- TanStack Router is wired through the Vite plugin and `RouterProvider`.
- The frontend route skeleton now includes:
  - `/`
  - `/login`
  - `/register`
  - `/settings`
- The current route tree is generated from file-based routes under `frontend/src/routes/`.
- Frontend production build is green and confirms route-level code splitting for the current route files.
- A frontend test harness now exists with Vitest, jsdom, and React Testing Library.
- Frontend dashboard route tests now verify the protected-route behavior at `/`.
- Frontend route tests now also verify the login screen shell at `/login`.
- Frontend component tests now verify `LoginForm` value submission and the current empty-submit guard.
- Frontend auth helper tests now verify the `loginWeb(...)` request/response contract and error handling.
- Frontend register helper tests now verify the `registerWeb(...)` request/response contract and error handling.
- Frontend auth session tests now verify the in-memory access token layer.
- Frontend auth bootstrap helper tests now verify the initial web session restoration success path.
- Frontend logout helper tests now verify the web logout request/response contract and session clearing behavior.
- Frontend current-user helper tests now verify the `getMe()` request/response contract and error handling.
- Frontend current-user Query tests now verify `useMeQuery()` success and error states.
- Frontend auth bootstrap gate tests now verify startup waiting behavior before the app renders routed content.
- Frontend logout-flow route tests now verify:
  - successful logout redirects to `/login`
  - failed logout stays on `/settings` and shows the error
  - revisiting a protected route after logout is blocked when mocked auth state changes to unauthenticated
- Frontend logout-flow route tests are now stronger:
  - they mock `getMe()` instead of mocking `useMeQuery()` directly
  - the real query hook still runs against a real `QueryClient`
  - the test router receives `context: { queryClient }`, matching the production router setup
  - most logout-flow tests seed `['me']` in the query cache to model an already-authenticated starting route
  - the re-fetch test intentionally avoids seeding `['me']` so `/settings` `beforeLoad` must call `getMe()`
  - repeated app-shell setup was reduced through a small local render helper in the test file
  - revisiting `/settings` after logout causes a fresh `getMe()` call, so the app is re-checking current-user state rather than only relying on a one-time redirect
- Frontend login route now:
  - submits through `loginWeb(...)`
  - displays backend auth errors
  - disables the submit button while pending
  - stores the returned access token in the current in-memory session layer
  - clears prior auth errors after a later successful submit
  - redirects to `/` on success
  - after redirecting to `/`, the protected dashboard route fetches the current user through `getMe()`
- Frontend register route now:
  - submits through `registerWeb(...)`
  - posts to `/api/auth/register/`
  - displays backend registration errors
  - disables the submit button while pending
  - clears prior registration errors after a later successful submit
  - redirects to `/login` on success so the user can log in explicitly
- Frontend `/settings` is now the first protected route:
  - unauthenticated state redirects to `/login`
  - authenticated state renders settings content and current user email
  - protection has been migrated to TanStack Router `beforeLoad`
  - `beforeLoad` delegates to `requireAuthBeforeLoad`
  - failed current-user resolution redirects before settings content renders
- Frontend `/` is now also a protected route:
  - unauthenticated state redirects to `/login`
  - authenticated state renders the dashboard
- Frontend protected routes now use TanStack Router `beforeLoad` instead of the former `RequireAuth` component guard.
- The shared router auth guard now lives in `frontend/src/features/auth/require-auth-before-load.ts`.
- `/` and `/settings` both use `beforeLoad: requireAuthBeforeLoad`.
- `frontend/src/features/auth/require-auth.tsx` was removed after `/` and `/settings` migrated to router-native auth.
- Frontend also now has a web-session bootstrap helper:
  - `frontend/src/features/auth/auth-bootstrap.ts`
  - it calls `GET /api/auth/csrf/`
  - it reads the `csrftoken` cookie
  - it calls `POST /api/auth/web/refresh/` with `X-CSRFToken`
  - it stores the returned access token in memory
- Frontend now also has a startup gate:
  - `frontend/src/features/auth/auth-bootstrap-gate.tsx`
  - `frontend/src/main.tsx` wraps the routed app with it
  - it shows `Restoring session...` while bootstrap is pending
  - it allows the app to continue rendering even when no restorable session exists
- Frontend now also has a web logout helper:
  - `frontend/src/features/auth/auth-logout-api.ts`
  - it reads the CSRF cookie
  - it calls `POST /api/auth/web/logout/`
  - it relies on cookie transport with `credentials: 'include'`
  - it clears the in-memory access token on success
- current nuance:
  - the logout-flow route tests currently model the post-logout auth change by changing mocked `getMe()` results across renders
  - that is better coverage than mocking `useMeQuery()` directly
  - it is still not the same as proving real query invalidation/refetch semantics end to end
- Frontend formatting is now wired with Prettier scripts:
  - `npm run format`
  - `npm run format:check`
- Frontend generated router output is excluded from Prettier through `.prettierignore`.

### What Is Not Done Yet

- Password reset is still deferred.
- Profile update and account/account-deletion flows are still deferred.
- Email verification is not implemented.
- No richer user-profile domain exists yet beyond auth basics.
- The frontend auth flow is partially integrated with the backend auth contract:
  - login stores the returned access token in memory
  - web session bootstrap can refresh an access token from the refresh cookie
  - `getMe()` uses that access token to call `GET /api/auth/me/`
  - web logout can clear the in-memory access token through the backend logout endpoint
  - protected routes now depend on current-user query state rather than only on login redirect behavior
- Login, register, settings, and dashboard route shells are now implemented; real dashboard product content is still placeholder-level.
- TanStack Query-based current-user state now exists, but bootstrap is still route-local rather than centralized at the app/auth-shell level.
- Protected-route behavior exists for both `/` and `/settings`, and both routes now use the shared TanStack Router `beforeLoad` helper.
- There is still no shared TanStack Router auth layout route for future protected routes.
- the bootstrap helper is now wired into app startup through `AuthBootstrapGate`
- the auth boundary is router-native at the route level, but not yet centralized into a dedicated protected route group/layout
- No CD pipeline exists yet.
- Security automation beyond lint, type-checking, and tests is not wired yet.

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
- CI is currently running on a GitHub-hosted Ubuntu runner, not on the local Docker Compose stack.
- The current backend suite is light enough to pass there without Postgres or Redis services because test settings fall back to SQLite and broker-backed behavior is not exercised end to end.
- That is good enough for the current auth slice, but it should be revisited once database- or Redis-specific behavior becomes part of the tested contract.
- C4 component diagrams should be added only once container internals are rich and stable enough to justify them; before that, context/container views plus sequence diagrams are the better tradeoff.
- Dynamic views should document implemented behavior only; for the current project state that means the hardened web auth flows, not future metrics or sync flows that have not been built yet.
- Local Docker is the development runtime, not a throwaway prototype; slices should be built there in a way that stays compatible with the MVP cloud target.
- The project should advance by vertical product slices, not by prematurely implementing every future subsystem.
- Manual metric tracking should be proven end to end before Android Health Connect sync is attempted.
- Normal pytest runs capture logs; use `-s --log-cli-level=INFO` when verifying logging behavior during focused tests.
- The current Playwright auth smoke test uses the dedicated `config.settings.e2e` runtime and `db-e2e/longevity_e2e`, with `POST /api/testing/reset/` clearing state before the flow.
- Longer term, browser E2E should move to an isolated E2E runtime/database so tests do not write into the everyday development dataset.

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

### Next Product Sequence

Recommended execution order from this checkpoint:

1. add basic structured backend logging
2. scaffold the React frontend
3. integrate the web auth slice end to end
4. implement manual metric definitions and manual metric logging
5. implement dashboard read flows
6. only then start the Android companion app and Health Connect sync spike

Updated checkpoint interpretation:
- step 1 is done
- step 2 is now done at the routing-shell level
- the immediate next step is step 3: integrate the web auth slice end to end

Immediate frontend auth integration target:
- keep login/register route behavior aligned with the backend auth contract
- continue adding focused frontend API helpers for existing auth endpoints as needed
- keep the access token in memory
- fetch `GET /api/auth/me/` into TanStack Query after successful auth transitions
- add route protection for authenticated pages such as `/settings`

Important frontend auth distinction:
- storing the access token after login is necessary, but it is not enough to represent authenticated user state by itself
- the token is only a credential string
- `GET /api/auth/me/` is the backend-confirmed answer to "who is the current logged-in user?"
- the next frontend slice should therefore build on the current session layer by fetching `me` and using that result for authenticated UI and route protection

Important backend auth detail for the `me` endpoint:
- in the current backend implementation, `me_view` relies on DRF authentication having already populated `request.user`
- the configured DRF default authentication class is SimpleJWT JWT authentication
- so the frontend `me` request must include the bearer access token in the `Authorization` header
- `me_view` is therefore a confirmation endpoint for the current token-backed session, not a separate login mechanism

Immediate TDD sequence for the frontend auth slice:
1. keep the frontend test harness green
2. add one failing login-route test at a time
3. implement the smallest UI change to pass
4. only then add API-facing auth behavior tests and implementation

Current frontend TDD checkpoint:
- route structure is covered first at the screen level
- reusable form behavior is now being covered separately from route wiring
- login route orchestration is now covered through redirect, error, and pending-state behavior
- the in-memory access-token session layer is now in place and covered
- the raw `getMe()` helper contract is now in place and covered
- the first TanStack Query-backed current-user hook is now in place and covered
- protected routes are now in place and covered on both `/` and `/settings`
- auth protection now uses the shared `requireAuthBeforeLoad` helper with the router `queryClient` context
- startup bootstrap is now wired through `AuthBootstrapGate`
- the next useful auth-routing cleanup is deciding whether to centralize protected routes into a TanStack Router auth layout route
- frontend coverage reporting is not wired yet; `@vitest/coverage-v8` is still missing

Current frontend tooling checkpoint:
- linting and formatting are now split cleanly:
  - ESLint for linting
  - Prettier for formatting
- this avoids spending manual effort on indentation-only cleanup in frontend files

Frontend implementation rule:
- start with a Vite SPA
- use route-level code splitting
- keep React Compiler out of the first slice
- use TanStack Query for backend-facing server state rather than building a custom fetch/cache layer first
- use TanStack Router for route state
- keep local UI state in React unless a real shared client-state need appears
- do not add Drizzle to the frontend stack
- keep `me` in Query, access token in a small in-memory session layer, and auth redirects in the router

Architecture rule:
- keep using the local Docker runtime for development
- keep `06-pragmatic-mvp-cloud-architecture.md` as the MVP deployment target
- move slices from local development toward MVP deployment incrementally instead of treating cloud as a later rewrite

### Linting, CI/CD, and Automation

Recommended next automation additions:

- Add a `Makefile` or `justfile` with stable commands:
  - `test`
  - `test-auth`
  - `lint`
  - `typecheck`
  - `docs-grep`
- Keep `ruff` as a mandatory lint gate.
- Keep `mypy` as the first type-checking gate.
- Add `bandit` and `pip-audit` to security automation.
- Add `pre-commit` so formatting/linting runs before commits.
- Expand GitHub Actions with:
  - security scans
  - optional docs consistency checks
  - frontend CI once the React app exists

Recommended CI order:
1. install dependencies
2. lint
3. type-check
4. run focused fast tests
5. run full backend tests
6. run security checks

When to add CI vs CD:
- backend CI is now in place and should remain the default quality gate for backend changes
- expand CI later to include frontend once the first React slice exists
- add CD only after the deployment shape, secrets handling, and release flow are stable enough
- do not rush CD before the project has a reliable test and lint gate

### Logging and Observability

Basic logging is not too early.

Good to add now:
- console/stdout backend logs
- simple formatter with env-controlled log levels
- request and error logging
- auth/security-relevant event logging
- clear Docker-local log output

Too early right now:
- full observability stack
- centralized log aggregation
- uptime alerting
- heavy dashboarding
- file-based container logging as the default pattern

Practical sequencing:
- add basic console logging now
- keep file handlers out of the default container path
- keep CI green while the backend grows
- add structured JSON logging, request IDs, and cloud log shipping later when deployments are becoming routine

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
