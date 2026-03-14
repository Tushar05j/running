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
      background: "var(--bg-card)",
      border: "1px solid var(--border-bright)",
      borderRadius: "var(--radius-md)",
      padding: "10px 14px",
      fontSize: 13,
    }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>
        {payload[0].value} {unit}
      </div>
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
function Analyzer() {
  const [weeklyData, setWeeklyData]     = useState([]);
  const [paceData, setPaceData]         = useState([]);
  const [summary, setSummary]           = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [loading, setLoading]           = useState(true);

  const fetchData = async () => {
    try {
      const [weeklyRes, paceRes] = await Promise.all([
        axios.get("http://localhost:5000/api/analytics/weekly-mileage"),
        axios.get("http://localhost:5000/api/analytics/pace-trend"),
      ]);
      // Show last 12 weeks only
      setWeeklyData(weeklyRes.data.slice(-12));
      // Show last 30 runs for pace trend
      setPaceData(paceRes.data.slice(-30).map(r => ({
        ...r,
        date: new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      })));
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
              <Bar
                dataKey="distance"
                fill="var(--orange)"
                radius={[4, 4, 0, 0]}
                opacity={0.85}
              />
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
    </div>
  );
}

export default Analyzer;
