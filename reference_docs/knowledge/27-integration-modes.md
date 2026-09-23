## Use When
- Load this when you need to decide how a provider integration should work, or when you need the canonical distinction between manual entry, device-bridge sync, direct cloud APIs, and aggregator-based integrations.

## Source
- Derived from the Samsung MVP integration decision and the updated architecture docs.

### Integration Modes

| Mode | How data reaches our backend | Best fit | Backend implications |
|---|---|---|---|
| **Manual entry** | User types values into our UI | Any metric, fallback for all users | Standard authenticated metrics endpoints |
| **Device bridge** | Mobile app reads on-device health data and uploads it | Samsung Health via Health Connect, Apple Health / HealthKit, other device-only sources | Requires companion app, on-device permissions, upload idempotency, sync cursor handling |
| **Direct cloud API** | Our backend talks directly to the provider's API | Providers with stable official server-side APIs | Requires provider OAuth/token storage, backfill jobs, provider-specific normalization |
| **Aggregator** | Our backend integrates with a third-party integration platform | Multiple cloud-friendly providers where aggregator cost/abstraction is worth it | Hosted link flow, signed webhooks, aggregator IDs, normalized upstream payloads |

### Selection Rules

- If the data lives only on the user's device, use **device bridge**.
- If the provider offers a stable official cloud API and we only need one or two providers, consider **direct cloud API** first.
- If we need many cloud-friendly providers quickly, consider an **aggregator**.
- Use **manual entry** as the fallback path even when sync exists.

### Project Decision

- **Foundation phase:** manual entry only.
- **MVP:** Samsung Health writes records into Health Connect; the Android companion app reads permitted Health Connect records and uploads normalized samples through the **device bridge**. The Django backend does not connect directly to either on-device system.
- **Full requirements:** hybrid model, combining **device bridge** for device-bound ecosystems and **aggregator/direct cloud API** for providers with server-side integrations.
