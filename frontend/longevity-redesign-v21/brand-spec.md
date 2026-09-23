# Brand spec — longevity frontend (extracted from `src/index.css`)

Source of truth: `/home/sevi/longevity/frontend/src/index.css` + `src/features/metrics/metric-trend-chart.tsx`. Light Cadence prototypes are superseded for product screens; use these tokens for any handoff.

## Tokens (`:root` verbatim hex, OKLch approx for derivation)

```css
:root {
  --bg: #0a0c10;            /* oklch(17% 0.01 260) */
  --surface: #111318;       /* oklch(21% 0.015 260) */
  --surface-high: #181c24;  /* oklch(25% 0.02 270) */
  --fg: #e2e8f0;            /* oklch(91% 0.02 260) */
  --muted: #718096;         /* oklch(62% 0.03 250) — text-dim */
  --border: #1f2535;        /* oklch(28% 0.03 270) */
  --accent: #00e5a0;        /* oklch(81% 0.17 165) */
  --accent-dim: rgba(0, 229, 160, 0.12);
  --warn: #ff6b4a;
  --blue: #3b82f6;
}
```

Mapped to charter six: `--bg` bg, `--surface` surface, `--fg` fg, `--muted` muted, `--border` border, `--accent` accent.

## Type

- Display/headings: `Syne, Space Grotesk, Trebuchet MS` — tight `-0.04em`, 800 weight, uppercase mono eyebrows.
- Body: `DM Sans, Aptos, Segoe UI`.
- Mono/labels: `DM Mono, SFMono-Regular, Consolas` — 10–11px, +0.08em, uppercase for eyebrows, pills, sources.

## Rules observed

1. Dark glow theme: radial mint top-left + blue bottom-right over `--bg`; cards `rgba(17,19,24,.72)` with 24px radii and deep shadow.
2. Mint means interactive/synced: nav active, latest values, chart line `#00e5a0` with `rgba(0,229,160,.16)` fill, source pills.
3. Metric model is dynamic: `MetricDefinition { slug, name, unit, category, min/max, is_default, is_active }`; `sleep_duration` is special (bedtime→wake, `Xh YYm` formatting, no unit suffix).
4. Chart contract: daily-latest-values line (not raw events), `MetricTrendChart` with Chart.js Filler; history table stays complete below it.
5. Settings = subscriptions: current plan, sync policy (`Automatic/Manual every N min`), custom-metric quota (`used/limit`), Stripe checkout/portal, logout — not profile/devices.
6. States are text-first: `Loading… / failed to load / No entries yet → Dashboard`, inline `form-error`, `aria-pressed` range toggle, 44px primary buttons.

One-sentence system: dark performance-lab theme with mint-on-graphite signals, mono labels, and per-metric cards that combine latest value + inline log + detail link.
