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
