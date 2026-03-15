import { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer
} from "recharts";

// ─── CUSTOM TOOLTIP ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background:   "var(--bg-card)",
      border:       "1px solid var(--border-bright)",
      borderRadius: "var(--radius-md)",
      padding:      "10px 14px",
      fontSize:     13,
    }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>
        {payload[0].value} {unit}
      </div>
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: accent ? "var(--primary)" : "var(--text-primary)", lineHeight: 1, marginBottom: 6 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{sub}</div>
      )}
    </div>
  );
}

// ─── MONTHLY COMPARISON CARD ──────────────────────────────────────────────────
function MonthCompareCard({ label, thisMonth, lastMonth, unit }) {
  const diff      = parseFloat(thisMonth) - parseFloat(lastMonth);
  const pct       = lastMonth > 0 ? ((diff / lastMonth) * 100).toFixed(0) : 0;
  const improved  = diff >= 0;
  const isTime    = unit === "h";

  return (
    <div className="card" style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
        {label}
      </div>

      {/* This month vs last month bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {/* This month */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
            <span style={{ color: "var(--text-secondary)" }}>This month</span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{thisMonth} {unit}</span>
          </div>
          <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width:  `${Math.min(100, (thisMonth / Math.max(thisMonth, lastMonth)) * 100)}%`,
              background: "var(--primary)",
              borderRadius: 3,
            }} />
          </div>
        </div>

        {/* Last month */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
            <span style={{ color: "var(--text-secondary)" }}>Last month</span>
            <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{lastMonth} {unit}</span>
          </div>
          <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height:     "100%",
              width:      `${Math.min(100, (lastMonth / Math.max(thisMonth, lastMonth)) * 100)}%`,
              background: "var(--border-bright)",
              borderRadius: 3,
            }} />
          </div>
        </div>
      </div>

      {/* Change badge */}
      <div style={{
        display:        "inline-flex",
        alignItems:     "center",
        gap:            5,
        fontSize:       12,
        fontWeight:     600,
        padding:        "3px 10px",
        borderRadius:   20,
        background:     improved ? "rgba(29,158,117,0.1)" : "rgba(226,75,74,0.1)",
        color:          improved ? "#1D9E75" : "#E24B4A",
      }}>
        {improved ? "▲" : "▼"} {Math.abs(pct)}% vs last month
      </div>
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
function Analyzer() {
  const [weeklyData,      setWeeklyData]      = useState([]);
  const [paceData,        setPaceData]        = useState([]);
  const [summary,         setSummary]         = useState(null);
  const [summaryLoading,  setSummaryLoading]  = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [stats,           setStats]           = useState(null);

  const fetchData = async () => {
    try {
      const [weeklyRes, paceRes, dashRes] = await Promise.all([
        axios.get("http://localhost:5000/api/analytics/weekly-mileage"),
        axios.get("http://localhost:5000/api/analytics/pace-trend"),
        axios.get("http://localhost:5000/api/analytics/dashboard"),
      ]);

      const weekly = weeklyRes.data;
      setWeeklyData(weekly.slice(-12));

      setPaceData(paceRes.data.slice(-30).map(r => ({
        ...r,
        date: new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      })));

      // ── Compute top row stats from weekly data ──────────────────────────────
      const allPaces = paceRes.data.map(r => r.pace).filter(Boolean);
      const bestPace = allPaces.length > 0 ? Math.min(...allPaces) : null;
      const bestPaceMin = bestPace ? Math.floor(bestPace) : null;
      const bestPaceSec = bestPace ? Math.round((bestPace - bestPaceMin) * 60).toString().padStart(2, "0") : null;

      // Total hours from dashboard
      const dash = dashRes.data;

      // ── Monthly comparison from weekly data ─────────────────────────────────
      const now       = new Date();
      const thisMonth = now.getMonth();
      const thisYear  = now.getFullYear();
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const lastYear  = thisMonth === 0 ? thisYear - 1 : thisYear;

      let thisMonthKm   = 0;
      let lastMonthKm   = 0;
      let thisMonthRuns = 0;
      let lastMonthRuns = 0;

      // Use pace data (individual runs) for monthly breakdown
      paceRes.data.forEach(run => {
        const d = new Date(run.date);
        if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
          thisMonthKm   += 0; // we don't have per-run distance in pace data
          thisMonthRuns += 1;
        }
        if (d.getMonth() === lastMonth && d.getFullYear() === lastYear) {
          lastMonthRuns += 1;
        }
      });

      // Use weekly data for monthly km (more accurate)
      weekly.forEach(w => {
        const d = new Date(w.week);
        if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
          thisMonthKm += parseFloat(w.distance);
        }
        if (d.getMonth() === lastMonth && d.getFullYear() === lastYear) {
          lastMonthKm += parseFloat(w.distance);
        }
      });

      setStats({
        bestPace:      bestPace ? `${bestPaceMin}:${bestPaceSec}` : "—",
        totalRuns:     dash.totalRuns,
        avgPace:       dash.avgPace,
        thisMonthKm:   thisMonthKm.toFixed(1),
        lastMonthKm:   lastMonthKm.toFixed(1),
        thisMonthRuns,
        lastMonthRuns,
      });

    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await axios.get("http://localhost:5000/api/ai/summarize");
      setSummary(res.data.summary);
    } catch {
      setSummary("Could not generate summary. Check your API key.");
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    window.addEventListener("strava-synced", fetchData);
    return () => window.removeEventListener("strava-synced", fetchData);
  }, []);

  if (loading) {
    return (
      <div className="analyzer-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="analyzer-page">

      {/* Header */}
      <div className="home-header">
        <div className="home-greeting">Training <span>Analyzer</span></div>
        <div className="home-date">Your performance trends over time</div>
      </div>

      {/* Top row — 3 stat cards */}
      {stats && (
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <StatCard
            label="Total runs"
            value={stats.totalRuns}
            sub="All time"
          />
          <StatCard
            label="Average pace"
            value={stats.avgPace}
            sub="Across all runs"
          />
          <StatCard
            label="Runs this month"
            value={stats.thisMonthRuns}
            sub="Current month"
            accent
          />
        </div>
      )}

      <div className="analyzer-grid">

        {/* AI Summary — full width */}
        <div className="ai-summary-card">
          <div className="ai-summary-header">
            <div className="summary-card-title" style={{ margin: 0 }}>AI Coaching Summary</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="ai-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                AI Coach
              </div>
              <button
                className="btn btn-primary"
                onClick={generateSummary}
                disabled={summaryLoading}
                style={{ padding: "8px 16px", fontSize: 13 }}
              >
                {summaryLoading ? "Analyzing..." : summary ? "Refresh" : "Generate Summary"}
              </button>
            </div>
          </div>

          {summary ? (
            <p className="ai-summary-text">{summary}</p>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 14, fontStyle: "italic" }}>
              Click "Generate Summary" to get personalized coaching feedback based on your recent training data.
            </p>
          )}
        </div>

        {/* Weekly Mileage Chart */}
        <div className="card">
          <div className="card-title">Weekly Mileage</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => {
                  const d = new Date(v);
                  return `${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}`;
                }}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                unit=" km"
              />
              <Tooltip content={<ChartTooltip unit="km" />} />
              <Bar dataKey="distance" fill="var(--orange)" radius={[4, 4, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pace Trend Chart */}
        <div className="card">
          <div className="card-title">Pace Trend</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={paceData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                unit="'"
                domain={["auto", "auto"]}
                reversed
              />
              <Tooltip content={<ChartTooltip unit="min/km" />} />
              <Line
                type="monotone"
                dataKey="pace"
                stroke="#7a3e0a"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#7a3e0a", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#c47a3a", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            Lower = faster. Y-axis inverted for clarity.
          </p>
        </div>

      </div>

      {/* Bottom row — monthly comparison */}
      {stats && (
        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
          <MonthCompareCard
            label="Monthly distance"
            thisMonth={stats.thisMonthKm}
            lastMonth={stats.lastMonthKm}
            unit="km"
          />
          <MonthCompareCard
            label="Monthly runs"
            thisMonth={stats.thisMonthRuns}
            lastMonth={stats.lastMonthRuns}
            unit="runs"
          />
          {/* Placeholder 3rd card — avg pace this month */}
          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
              All time avg pace
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1, marginBottom: 6 }}>
              {stats.avgPace}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Across {stats.totalRuns} total runs
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Analyzer;