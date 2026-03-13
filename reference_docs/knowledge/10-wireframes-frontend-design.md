
## Use When
- Load when you need to work on the frontend. Load to check the frontend design.

## Source
- 


```
import { useState } from "react";

const SCREENS = ["Auth", "Dashboard", "Log Metric", "Metric Detail", "Samsung Sync"];

// ─── Design tokens ──────────────────────────────────────────────
const C = {
  bg: "#0a0c10",
  surface: "#111318",
  surfaceHigh: "#181c24",
  border: "#1f2535",
  accent: "#00e5a0",
  accentDim: "rgba(0,229,160,0.12)",
  accentGlow: "rgba(0,229,160,0.25)",
  warn: "#ff6b4a",
  muted: "#4a5568",
  text: "#e2e8f0",
  textDim: "#718096",
  textFaint: "#2d3748",
  blue: "#3b82f6",
  purple: "#8b5cf6",
};

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; }

  .wf-root {
    font-family: 'DM Sans', sans-serif;
    background: ${C.bg};
    color: ${C.text};
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Nav bar */
  .wf-nav {
    display: flex;
    gap: 4px;
    padding: 12px 20px;
    background: ${C.surface};
    border-bottom: 1px solid ${C.border};
    overflow-x: auto;
    flex-shrink: 0;
  }
  .wf-nav-btn {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid ${C.border};
    background: transparent;
    color: ${C.textDim};
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: all .15s;
  }
  .wf-nav-btn:hover { color: ${C.text}; border-color: ${C.muted}; }
  .wf-nav-btn.active {
    background: ${C.accentDim};
    border-color: ${C.accent};
    color: ${C.accent};
  }

  /* Screen label */
  .screen-label {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: ${C.muted};
    letter-spacing: .12em;
    text-transform: uppercase;
    padding: 10px 20px 0;
  }

  /* ── SHARED COMPONENTS ── */
  .phone {
    width: 375px;
    min-height: 812px;
    background: ${C.bg};
    border: 1.5px solid ${C.border};
    border-radius: 40px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    box-shadow: 0 0 80px rgba(0,229,160,0.04), 0 24px 80px rgba(0,0,0,0.6);
  }
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 24px 0;
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: ${C.textDim};
    flex-shrink: 0;
  }
  .top-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    flex-shrink: 0;
  }
  .logo-mark {
    font-family: 'Syne', sans-serif;
    font-weight: 800;
    font-size: 16px;
    color: ${C.accent};
    letter-spacing: -.03em;
  }
  .avatar {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, ${C.accent}, ${C.blue});
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 600; color: #000;
  }
  .scroll-area {
    flex: 1;
    overflow-y: auto;
    padding: 0 20px 100px;
  }
  .scroll-area::-webkit-scrollbar { display: none; }

  /* Bottom nav */
  .bottom-nav {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: ${C.surface};
    border-top: 1px solid ${C.border};
    display: flex;
    padding: 8px 0 20px;
    flex-shrink: 0;
  }
  .bnav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font-size: 9px;
    color: ${C.muted};
    font-family: 'DM Mono', monospace;
  }
  .bnav-item.active { color: ${C.accent}; }
  .bnav-icon {
    width: 22px; height: 22px;
    border-radius: 6px;
    background: transparent;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
  }
  .bnav-item.active .bnav-icon {
    background: ${C.accentDim};
  }

  /* FAB */
  .fab {
    position: absolute;
    bottom: 72px;
    right: 20px;
    width: 52px; height: 52px;
    border-radius: 16px;
    background: ${C.accent};
    display: flex; align-items: center; justify-content: center;
    font-size: 24px;
    color: #000;
    font-weight: 300;
    box-shadow: 0 8px 24px ${C.accentGlow};
    cursor: pointer;
  }

  /* Cards */
  .card {
    background: ${C.surfaceHigh};
    border: 1px solid ${C.border};
    border-radius: 16px;
    padding: 16px;
  }
  .card + .card { margin-top: 12px; }

  /* Metric chip */
  .metric-chip {
    background: ${C.surfaceHigh};
    border: 1px solid ${C.border};
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .chip-label {
    font-size: 10px;
    font-family: 'DM Mono', monospace;
    color: ${C.textDim};
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .chip-value {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 22px;
    color: ${C.text};
    line-height: 1;
  }
  .chip-unit {
    font-size: 11px;
    color: ${C.muted};
    font-family: 'DM Mono', monospace;
  }
  .chip-delta {
    font-size: 11px;
    font-family: 'DM Mono', monospace;
    display: flex; align-items: center; gap: 3px;
  }
  .delta-up { color: ${C.accent}; }
  .delta-down { color: ${C.warn}; }

  /* Chart placeholder */
  .chart-area {
    background: ${C.surface};
    border: 1px solid ${C.border};
    border-radius: 12px;
    padding: 16px;
    margin-top: 12px;
  }
  .chart-svg { width: 100%; overflow: visible; }

  /* Tags */
  .tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 10px;
    font-family: 'DM Mono', monospace;
    background: ${C.accentDim};
    color: ${C.accent};
    border: 1px solid rgba(0,229,160,0.2);
  }
  .tag-warn {
    background: rgba(255,107,74,0.1);
    color: ${C.warn};
    border-color: rgba(255,107,74,0.2);
  }
  .tag-blue {
    background: rgba(59,130,246,0.12);
    color: ${C.blue};
    border-color: rgba(59,130,246,0.2);
  }

  /* Form elements */
  .input-group { margin-bottom: 14px; }
  .input-label {
    font-size: 11px;
    font-family: 'DM Mono', monospace;
    color: ${C.textDim};
    margin-bottom: 6px;
    letter-spacing: .08em;
  }
  .input-field {
    width: 100%;
    background: ${C.surface};
    border: 1px solid ${C.border};
    border-radius: 10px;
    padding: 12px 14px;
    color: ${C.text};
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    outline: none;
  }
  .input-field:focus { border-color: ${C.accent}; }
  .input-field-accent {
    border-color: ${C.accent};
    box-shadow: 0 0 0 3px ${C.accentDim};
  }

  /* Buttons */
  .btn-primary {
    width: 100%;
    padding: 14px;
    background: ${C.accent};
    border: none;
    border-radius: 12px;
    color: #000;
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    letter-spacing: .02em;
  }
  .btn-ghost {
    width: 100%;
    padding: 12px;
    background: transparent;
    border: 1px solid ${C.border};
    border-radius: 12px;
    color: ${C.textDim};
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    cursor: pointer;
  }

  /* Section heading */
  .section-head {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 16px;
    color: ${C.text};
    margin: 20px 0 10px;
  }
  .section-sub {
    font-size: 13px;
    color: ${C.textDim};
    margin-bottom: 14px;
  }

  /* Divider */
  .divider {
    height: 1px;
    background: ${C.border};
    margin: 16px 0;
  }

  /* Toggle row */
  .toggle-row {
    display: flex;
    gap: 6px;
    margin-bottom: 14px;
  }
  .toggle-pill {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-family: 'DM Mono', monospace;
    border: 1px solid ${C.border};
    background: transparent;
    color: ${C.muted};
    cursor: pointer;
  }
  .toggle-pill.active {
    background: ${C.accentDim};
    border-color: ${C.accent};
    color: ${C.accent};
  }

  /* Entry row */
  .entry-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid ${C.textFaint};
  }
  .entry-row:last-child { border-bottom: none; }
  .entry-source {
    font-size: 10px;
    font-family: 'DM Mono', monospace;
    color: ${C.muted};
  }
  .entry-val {
    font-family: 'Syne', sans-serif;
    font-weight: 600;
    font-size: 16px;
  }
  .entry-time {
    font-size: 11px;
    color: ${C.muted};
    font-family: 'DM Mono', monospace;
  }

  /* Provider card */
  .provider-card {
    background: ${C.surfaceHigh};
    border: 1px solid ${C.border};
    border-radius: 14px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 10px;
  }
  .provider-logo {
    width: 42px; height: 42px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }
  .provider-status {
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-left: auto;
    flex-shrink: 0;
  }
  .status-connected { background: ${C.accent}; box-shadow: 0 0 8px ${C.accent}; }
  .status-inactive { background: ${C.muted}; }

  /* Stats grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin: 14px 0;
  }
  .stat-cell {
    background: ${C.surfaceHigh};
    border: 1px solid ${C.border};
    border-radius: 10px;
    padding: 10px 8px;
    text-align: center;
  }
  .stat-val {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 16px;
    color: ${C.text};
  }
  .stat-key {
    font-size: 9px;
    font-family: 'DM Mono', monospace;
    color: ${C.muted};
    text-transform: uppercase;
    letter-spacing: .06em;
    margin-top: 3px;
  }

  /* Modal overlay */
  .modal-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: flex-end;
    border-radius: 40px;
    overflow: hidden;
  }
  .modal-sheet {
    width: 100%;
    background: ${C.surface};
    border-top: 1px solid ${C.border};
    border-radius: 24px 24px 0 0;
    padding: 20px;
    padding-bottom: 40px;
  }
  .modal-handle {
    width: 36px; height: 4px;
    background: ${C.muted};
    border-radius: 2px;
    margin: 0 auto 20px;
  }

  /* Back button */
  .back-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: ${C.accent};
    font-family: 'DM Mono', monospace;
    cursor: pointer;
    margin-bottom: 4px;
  }

  /* Screen layout */
  .screens-wrap {
    flex: 1;
    padding: 16px 20px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow-y: auto;
    gap: 8px;
  }

  /* Sparkline */
  .sparkline { display: block; }

  /* Annotation */
  .annotation {
    background: rgba(0,229,160,0.06);
    border: 1px dashed rgba(0,229,160,0.25);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 10px;
    color: ${C.accent};
    font-family: 'DM Mono', monospace;
    margin-top: 8px;
    letter-spacing: .04em;
  }

  .select-field {
    width: 100%;
    background: ${C.surface};
    border: 1px solid ${C.accent};
    border-radius: 10px;
    padding: 12px 14px;
    color: ${C.text};
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    appearance: none;
    box-shadow: 0 0 0 3px ${C.accentDim};
  }
`;

// ─── Mini SVG chart ──────────────────────────────────────────────
function TrendLine({ color = C.accent, data, height = 60 }) {
  const w = 295, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 8) - 4;
    return `${x},${y}`;
  }).join(" ");
  const areaPath = `M0,${h} L${pts.split(" ").map(p => p).join(" L")} L${w},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height, display: "block" }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace("#","")})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* last point dot */}
      {(() => {
        const last = data[data.length - 1];
        const x = w;
        const y = h - ((last - min) / (max - min || 1)) * (h - 8) - 4;
        return <circle cx={x} cy={y} r="4" fill={color} />;
      })()}
    </svg>
  );
}

// ─── Screen 1: Auth ──────────────────────────────────────────────
function AuthScreen() {
  return (
    <div className="phone">
      <div className="status-bar"><span>9:41</span><span>●●●</span></div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px 40px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 20, background: C.accentDim, border: `1px solid ${C.accent}`, marginBottom: 16, fontSize: 28 }}>⬡</div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, color: C.text, letterSpacing: "-.04em" }}>longevity</div>
          <div style={{ fontSize: 13, color: C.textDim, marginTop: 4 }}>Track what matters. Live longer.</div>
        </div>

        {/* Form */}
        <div className="input-group">
          <div className="input-label">EMAIL</div>
          <input readOnly className="input-field" value="alex@example.com" style={{ color: C.text }} />
        </div>
        <div className="input-group">
          <div className="input-label">PASSWORD</div>
          <input readOnly type="password" className="input-field input-field-accent" value="••••••••••" style={{ color: C.text }} />
        </div>

        <div style={{ textAlign: "right", marginBottom: 20, fontSize: 12, color: C.accent, fontFamily: "'DM Mono', monospace" }}>Forgot password?</div>

        <button className="btn-primary">Sign In</button>

        <div className="divider" />

        <button className="btn-ghost">Create an Account</button>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace" }}>
          Rate limited: 5 attempts / min
        </div>
        <div className="annotation" style={{ marginTop: 12 }}>POST /api/v1/auth/login/ → JWT access + refresh</div>
      </div>
    </div>
  );
}

// ─── Screen 2: Dashboard ─────────────────────────────────────────
function DashboardScreen() {
  const hrData = [64, 61, 63, 58, 60, 57, 59, 56, 58, 55, 57, 58, 60, 57, 56];
  return (
    <div className="phone">
      <div className="status-bar"><span>9:41</span><span>●●●</span></div>
      <div className="top-nav">
        <div className="logo-mark">⬡ longevity</div>
        <div className="avatar">A</div>
      </div>

      <div className="scroll-area" style={{ paddingBottom: 120 }}>
        {/* Greeting */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: C.text }}>Good morning, Alex</div>
          <div style={{ fontSize: 12, color: C.textDim, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>Mar 7 · Streak: 14 days 🔥</div>
        </div>

        {/* Metric cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
          {[
            { label: "Resting HR", value: "58", unit: "bpm", delta: "+2%", up: true, color: C.accent },
            { label: "HRV", value: "72", unit: "ms", delta: "+8%", up: true, color: C.blue },
            { label: "VO2 Max", value: "48.3", unit: "ml/kg", delta: "-0.5%", up: false, color: C.purple },
            { label: "Sleep", value: "7.4", unit: "hrs", delta: "+12%", up: true, color: "#f59e0b" },
            { label: "Weight", value: "74.2", unit: "kg", delta: "-0.3%", up: true, color: C.accent },
          ].map((m, i) => (
            <div key={i} className="metric-chip" style={{ borderColor: i === 0 ? m.color : C.border, boxShadow: i === 0 ? `0 0 16px rgba(0,229,160,0.08)` : "none" }}>
              <div className="chip-label">{m.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <div className="chip-value" style={{ color: m.color }}>{m.value}</div>
                <div className="chip-unit">{m.unit}</div>
              </div>
              <div className={`chip-delta ${m.up ? "delta-up" : "delta-down"}`}>
                {m.up ? "↑" : "↓"} {m.delta} <span style={{ color: C.muted }}>7d</span>
              </div>
            </div>
          ))}
        </div>

        {/* Trend chart */}
        <div className="section-head">Trend Overview</div>
        <div className="chart-area">
          <div className="toggle-row">
            {["7d", "30d", "90d"].map((t, i) => (
              <div key={t} className={`toggle-pill ${i === 1 ? "active" : ""}`}>{t}</div>
            ))}
          </div>
          <TrendLine data={hrData} height={80} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, color: C.muted }}>
            <span>Feb 6</span><span>Feb 14</span><span>Feb 22</span><span>Mar 7</span>
          </div>
        </div>

        {/* Recent entries */}
        <div className="section-head">Recent Entries</div>
        {[
          { label: "Resting HR", val: "58 bpm", time: "Today 07:15", source: "manual" },
          { label: "HRV", val: "72 ms", time: "Today 07:14", source: "samsung_health" },
          { label: "Weight", val: "74.2 kg", time: "Yesterday", source: "manual" },
        ].map((e, i) => (
          <div key={i} className="entry-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{e.label}</div>
              <div className="entry-time">{e.time} · <span className="tag" style={{ padding: "1px 6px", fontSize: 9 }}>{e.source}</span></div>
            </div>
            <div className="entry-val">{e.val}</div>
          </div>
        ))}

        <div className="annotation">GET /api/v1/metrics/analytics/?range=30d → cached 10min TTL</div>
      </div>

      {/* FAB */}
      <div className="fab">+</div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        {[
          { icon: "⊡", label: "home", active: true },
          { icon: "◈", label: "metrics", active: false },
          { icon: "◎", label: "wearables", active: false },
          { icon: "⊙", label: "profile", active: false },
        ].map((n, i) => (
          <div key={i} className={`bnav-item ${n.active ? "active" : ""}`}>
            <div className="bnav-icon">{n.icon}</div>
            <span>{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Screen 3: Log Metric ────────────────────────────────────────
function LogMetricScreen() {
  return (
    <div className="phone">
      <div className="status-bar"><span>9:41</span><span>●●●</span></div>
      {/* Background screen (blurred) */}
      <div className="top-nav">
        <div className="logo-mark">⬡ longevity</div>
        <div className="avatar">A</div>
      </div>
      <div style={{ padding: "0 20px", opacity: 0.25 }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: C.text }}>Good morning, Alex</div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="metric-chip" />
          ))}
        </div>
      </div>

      {/* Modal overlay */}
      <div className="modal-overlay">
        <div className="modal-sheet">
          <div className="modal-handle" />
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: C.text, marginBottom: 20 }}>Log a Metric</div>

          <div className="input-group">
            <div className="input-label">METRIC TYPE</div>
            <select className="select-field" readOnly>
              <option>Resting Heart Rate</option>
            </select>
          </div>

          {/* Value + unit row */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <div className="input-label">VALUE</div>
              <input readOnly className="input-field input-field-accent" value="58" style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 24, color: C.accent }} />
            </div>
            <div>
              <div className="input-label">UNIT</div>
              <input readOnly className="input-field" value="bpm" style={{ color: C.muted }} />
            </div>
          </div>

          <div className="input-group">
            <div className="input-label">DATE & TIME</div>
            <input readOnly className="input-field" value="2026-03-07  07:15" style={{ color: C.text, fontFamily: "'DM Mono', monospace", fontSize: 13 }} />
          </div>

          <div className="input-group">
            <div className="input-label">NOTES (optional)</div>
            <input readOnly className="input-field" value="Morning, after coffee" style={{ color: C.textDim }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
            <button className="btn-ghost">Cancel</button>
            <button className="btn-primary" style={{ width: "auto" }}>Save Entry</button>
          </div>
          <div className="annotation" style={{ marginTop: 12 }}>POST /api/v1/metrics/entries/ → 201 Created</div>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 4: Metric Detail ─────────────────────────────────────
function MetricDetailScreen() {
  const data30d = [62, 64, 61, 63, 60, 58, 57, 59, 61, 60, 62, 58, 56, 57, 58, 60, 59, 57, 56, 58, 57, 56, 55, 57, 58, 60, 57, 56, 57, 58];
  return (
    <div className="phone">
      <div className="status-bar"><span>9:41</span><span>●●●</span></div>
      <div style={{ padding: "10px 20px 0" }}>
        <div className="back-btn">← Dashboard</div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 4 }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: C.text }}>Resting HR</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "'DM Mono', monospace" }}>resting_hr · bpm</div>
          </div>
          <div className="tag">30d</div>
        </div>

        {/* Big value */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 52, color: C.accent, lineHeight: 1 }}>58</span>
          <div>
            <div style={{ fontSize: 16, color: C.muted, fontFamily: "'DM Mono', monospace" }}>bpm</div>
            <div style={{ fontSize: 12, color: C.accent, fontFamily: "'DM Mono', monospace" }}>↓ 4 from 30d avg</div>
          </div>
        </div>
      </div>

      <div className="scroll-area" style={{ paddingTop: 12, paddingBottom: 120 }}>
        {/* Chart */}
        <div className="chart-area" style={{ marginTop: 0 }}>
          <div className="toggle-row">
            {["7d", "30d", "90d", "1y"].map((t, i) => (
              <div key={t} className={`toggle-pill ${i === 1 ? "active" : ""}`}>{t}</div>
            ))}
          </div>
          <TrendLine data={data30d} height={100} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, color: C.muted }}>
            <span>Feb 5</span><span>Feb 15</span><span>Feb 25</span><span>Mar 7</span>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          {[
            { key: "Avg", val: "59" },
            { key: "Min", val: "55" },
            { key: "Max", val: "64" },
            { key: "Trend", val: "↓ 4%" },
          ].map(s => (
            <div key={s.key} className="stat-cell">
              <div className="stat-val" style={{ color: s.key === "Trend" ? C.accent : C.text }}>{s.val}</div>
              <div className="stat-key">{s.key}</div>
            </div>
          ))}
        </div>

        {/* History */}
        <div className="section-head">Entry History</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace", marginBottom: 10 }}>
          cursor-paginated · recorded_at DESC
        </div>
        {[
          { val: "58", time: "Mar 7 07:15", source: "manual", tag: "manual" },
          { val: "57", time: "Mar 6 07:22", source: "samsung_health", tag: "samsung" },
          { val: "56", time: "Mar 5 07:18", source: "samsung_health", tag: "samsung" },
          { val: "60", time: "Mar 4 08:01", source: "manual", tag: "manual" },
          { val: "59", time: "Mar 3 07:45", source: "samsung_health", tag: "samsung" },
        ].map((e, i) => (
          <div key={i} className="entry-row">
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "'DM Mono', monospace" }}>{e.time}</div>
              <div className={`tag ${e.tag === "manual" ? "" : "tag-blue"}`} style={{ marginTop: 3, fontSize: 9 }}>{e.source}</div>
            </div>
            <div className="entry-val" style={{ color: C.accent }}>{e.val} <span style={{ fontSize: 12, color: C.muted, fontFamily: "'DM Mono', monospace" }}>bpm</span></div>
          </div>
        ))}

        <div style={{ padding: "14px 0", textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 12, color: C.accent }}>
          Load more ↓
        </div>
        <div className="annotation">GET /api/v1/metrics/analytics/resting_hr/?range=30d</div>
      </div>

      <div className="bottom-nav">
        {[
          { icon: "⊡", label: "home", active: false },
          { icon: "◈", label: "metrics", active: true },
          { icon: "◎", label: "wearables", active: false },
          { icon: "⊙", label: "profile", active: false },
        ].map((n, i) => (
          <div key={i} className={`bnav-item ${n.active ? "active" : ""}`}>
            <div className="bnav-icon">{n.icon}</div>
            <span>{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Screen 5: Samsung Sync ───────────────────────────────────────
function WearablesScreen() {
  const connected = [
    { name: "Samsung Health", icon: "◎", color: C.accent, bg: "rgba(0,229,160,0.12)", lastSync: "2 min ago", status: true },
  ];
  const available = [
    { name: "Health Connect Permission", icon: "◌", color: C.blue, bg: "rgba(59,130,246,0.12)" },
    { name: "Android Companion App", icon: "⌁", color: C.purple, bg: "rgba(139,92,246,0.12)" },
  ];
  return (
    <div className="phone">
      <div className="status-bar"><span>9:41</span><span>●●●</span></div>
      <div className="top-nav">
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: C.text }}>Samsung Sync</div>
        <div className="tag">Android MVP</div>
      </div>

      <div className="scroll-area" style={{ paddingBottom: 100 }}>
        <div className="section-sub">Samsung data is read on device, then uploaded securely by the Android companion app.</div>

        {/* Connected */}
        <div className="section-head" style={{ marginTop: 4 }}>Connected</div>
        {connected.map((p, i) => (
          <div key={i} className="provider-card">
            <div className="provider-logo" style={{ background: p.bg, fontSize: 22 }}>{p.icon}</div>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 15, color: C.text }}>{p.name}</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>Last sync: {p.lastSync}</div>
              <div className="tag" style={{ marginTop: 4, fontSize: 9 }}>active</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <div className="provider-status status-connected" />
              <div style={{ fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>Resync</div>
            </div>
          </div>
        ))}

        <div className="annotation">POST /api/v1/wearables/connections/{"{id}"}/resync/ → 202 Accepted</div>

        {/* Setup */}
        <div className="section-head">Setup</div>
        {available.map((p, i) => (
          <div key={i} className="provider-card" style={{ opacity: 0.7 }}>
            <div className="provider-logo" style={{ background: p.bg, fontSize: 22 }}>{p.icon}</div>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 15, color: C.text }}>{p.name}</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>Required for Samsung sync</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <div style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${C.accent}`, color: C.accent, fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>
                Open
              </div>
            </div>
          </div>
        ))}

        <div className="annotation" style={{ marginTop: 4 }}>POST /api/v1/wearables/connections/ → register/update device bridge</div>

        {/* Disconnect */}
        <div className="divider" />
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 8 }}>Data Flow</div>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
          Samsung Health → Health Connect → Android app → upload → deduplicate → dashboard updated.
        </div>
      </div>

      <div className="bottom-nav">
        {[
          { icon: "⊡", label: "home", active: false },
          { icon: "◈", label: "metrics", active: false },
          { icon: "◎", label: "sync", active: true },
          { icon: "⊙", label: "profile", active: false },
        ].map((n, i) => (
          <div key={i} className={`bnav-item ${n.active ? "active" : ""}`}>
            <div className="bnav-icon">{n.icon}</div>
            <span>{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SCREEN_COMPONENTS = [AuthScreen, DashboardScreen, LogMetricScreen, MetricDetailScreen, WearablesScreen];
const SCREEN_LABELS = [
  "Screen 1 — Auth / Login",
  "Screen 2 — Dashboard",
  "Screen 3 — Log Metric (Modal)",
  "Screen 4 — Metric Detail",
  "Screen 5 — Samsung Sync",
];

// ─── Root ────────────────────────────────────────────────────────
export default function App() {
  const [active, setActive] = useState(0);
  const Screen = SCREEN_COMPONENTS[active];

  return (
    <>
      <style>{styles}</style>
      <div className="wf-root">
        <div className="wf-nav">
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: C.muted, marginRight: 8, alignSelf: "center" }}>Wireframes:</span>
          {SCREENS.map((s, i) => (
            <button key={i} className={`wf-nav-btn ${active === i ? "active" : ""}`} onClick={() => setActive(i)}>
              {i + 1}. {s}
            </button>
          ))}
        </div>

        <div className="screens-wrap">
          <div className="screen-label">{SCREEN_LABELS[active]}</div>
          <Screen />
        </div>
      </div>
    </>
  );
}





```
