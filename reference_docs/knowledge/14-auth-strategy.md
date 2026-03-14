### 2.4 Auth Strategy

## Use When
- Load this when you need the high-level auth strategy, token model, email storage approach, social login scope, wearable auth flow, or auth rate-limiting rules.

## Source
- Derived from `reference_docs/knowledge/planning.md` section 2.4.

- **JWT** (short-lived access 15 min + HTTP-only refresh 7 days)
- **Email storage** = encrypted ciphertext + `email_lookup_hash` for uniqueness / lookup
- **OAuth social login** (Google, Apple) after MVP
- **Samsung sync auth** = Android companion app uses our JWT and asks for Samsung Health / Health Connect permissions on device
- **Future cloud-provider sync auth** = hosted link flow + signed webhooks through an aggregator or direct provider OAuth where appropriate
- **Rate limiting** on auth endpoints (5 login attempts/min)

### Django Auth Foundation

- Use Django's built-in auth framework for the user model integration, password hashing, permissions, admin compatibility, and authentication plumbing.
- Django's default auth transport is session-based authentication via cookies.
- We do not reimplement password hashing or core identity primitives ourselves. Product-specific auth behavior sits on top of Django's auth system.

### Sessions vs JWT

- The main difference is where authenticated state lives.
- **Sessions**: the server stores login state and the client sends a session cookie that points to that server-side state.
- **JWT**: the client sends a signed token on each request and the server validates the token instead of first loading a server-side session record.
- This is mostly an application-shape decision, not a blanket statement that one option is always more secure.

### Why This Project Uses JWT

- The product is API-first and needs to support both a React frontend and an Android client.
- JWT fits multi-client API access better than Django sessions.
- Django sessions still remain appropriate for Django admin because admin is server-rendered and works naturally with the built-in session flow.

### Recommended Token Model

- **Access token**: short-lived JWT, target 15 minutes, sent in the `Authorization: Bearer <token>` header.
- **Refresh token**: longer-lived JWT, target 7 days, used only to mint new access tokens.
- **Web client**: store the refresh token in an `HttpOnly`, `Secure` cookie; keep the access token short-lived and send it in the authorization header.
- **Android client**: store tokens in secure platform storage, not plain local storage equivalents.

### Security Notes

- Sessions are often simpler to reason about for classic server-rendered apps because the server owns invalidation directly.
- JWT can be equally secure, but only with careful implementation: short access-token lifetime, protected refresh-token storage, and refresh rotation / blacklist strategy when stronger logout semantics are required.
- For web clients, avoid storing long-lived JWTs in JavaScript-readable storage.
- For this project, use JWT for product APIs and Django sessions for admin rather than forcing one mechanism onto every surface.
