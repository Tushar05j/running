import { useEffect, useState } from "react";
import axios from "axios";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getThisWeekRuns(runs) {
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  startOfWeek.setDate(now.getDate() + diff);
  startOfWeek.setHours(0, 0, 0, 0);
  return runs.filter(r => new Date(r.date) >= startOfWeek);
}

function getDayName(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });
}

function getDayNum(dateStr) {
  return new Date(dateStr).getDate();
}

// Returns "low" | "optimal" | "high" — used for zone highlight
function getACWRZone(acwr) {
  if (acwr < 0.8) return "low";
  if (acwr > 1.5) return "high";
  return "optimal";
}

function getACWRMax(acuteLoad, chronicLoad) {
  return Math.max(parseFloat(acuteLoad), parseFloat(chronicLoad), 1);
}

// Efficiency score → human label + tip
function getEfficiencyLabel(score) {
  if (score >= 85) return { label: "Excellent form", color: "#1D9E75", bg: "#E1F5EE", textColor: "#085041" };
  if (score >= 70) return { label: "Good form",      color: "#c47a3a", bg: "#FAEEDA", textColor: "#633806" };
  if (score >= 50) return { label: "Fair form",      color: "#BA7517", bg: "#FAEEDA", textColor: "#633806" };
  return               { label: "Needs work",        color: "#E24B4A", bg: "#FCEBEB", textColor: "#791F1F" };
}

// Arc gauge: score 0–100 → stroke-dasharray on a 160-unit arc
function EfficiencyGauge({ score }) {
  const arcLength = 160;
  const filled = (score / 100) * arcLength;
  const { label, color, bg, textColor } = getEfficiencyLabel(score);

  return (
    <div className="efficiency-card">
      <div className="summary-card-title">Running efficiency</div>

      {/* Score row */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 18 }}>
        {/* Arc gauge */}
        <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
          <svg width="88" height="88" viewBox="0 0 88 88">
            {/* Track */}
            <circle
              cx="44" cy="44" r="34"
              fill="none"
              stroke="var(--border)"
              strokeWidth="7"
              strokeDasharray={`${arcLength} 360`}
              strokeDashoffset="-100"
              strokeLinecap="round"
            />
            {/* Fill */}
            <circle
              cx="44" cy="44" r="34"
              fill="none"
              stroke={color}
              strokeWidth="7"
              strokeDasharray={`${filled} ${arcLength}`}
              strokeDashoffset="-100"
              strokeLinecap="round"
            />
            <text
              x="44" y="42"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="22"
              fontWeight="500"
              fill="var(--text-primary)"
            >
              {score}
            </text>
            <text
              x="44" y="60"
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-muted)"
            >
              / 100
            </text>
          </svg>
        </div>

        {/* Label + description */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            {label}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 10 }}>
            Your pace is consistent — a sign of controlled, efficient running.
          </div>
          <span style={{
            display: "inline-block",
            fontSize: 12,
            fontWeight: 500,
            padding: "3px 10px",
            borderRadius: 20,
            background: bg,
            color: textColor,
          }}>
            Pace consistency
          </span>
        </div>
      </div>

      {/* Score scale bar */}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Score scale</div>
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ flex: 1, background: "#F09595" }} />
        <div style={{ flex: 1, background: "#EF9F27" }} />
        <div style={{ flex: 1, background: "#97C459" }} />
        <div style={{ flex: 1, background: "#1D9E75" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>
        <span>Needs work</span>
        <span>Fair</span>
        <span>Good</span>
        <span>Excellent</span>
      </div>

      {/* Actionable tip */}
      <div style={{
        padding: "10px 14px",
        background: "var(--bg-2)",
        borderLeft: `3px solid ${color}`,
        fontSize: 13,
        color: "var(--text-muted)",
        lineHeight: 1.5,
      }}>
        {score >= 85
          ? "Outstanding! Maintain your current training rhythm."
          : score >= 70
          ? "Try adding one tempo run per week to push your score above 85."
          : score >= 50
          ? "Focus on running at an even effort — avoid starting too fast."
          : "Start with short, easy runs to build a consistent pace base."}
      </div>
    </div>
  );
}

// Training load card — plain English zones
function TrainingLoadCard({ training }) {
  const acwrVal = parseFloat(training.acwr);
  const zone    = getACWRZone(acwrVal);
  const maxLoad = getACWRMax(training.acuteLoad, training.chronicLoad);

  const acuteWidth   = Math.round((parseFloat(training.acuteLoad)   / maxLoad) * 100);
  const chronicWidth = Math.round((parseFloat(training.chronicLoad) / maxLoad) * 100);

  const zones = [
    {
      key: "low",
      label: "Under",
      sub: "Room to increase",
      activeBg: "#E6F1FB",
      activeBorder: "#378ADD",
      activeTitle: "#0C447C",
      activeSub: "#185FA5",
    },
    {
      key: "optimal",
      label: "Optimal",
      sub: "Keep it up",
      activeBg: "#EAF3DE",
      activeBorder: "#639922",
      activeTitle: "#27500A",
      activeSub: "#3B6D11",
    },
    {
      key: "high",
      label: "High",
      sub: "Rest needed",
      activeBg: "#FCEBEB",
      activeBorder: "#E24B4A",
      activeTitle: "#791F1F",
      activeSub: "#A32D2D",
    },
  ];

  const statusMessages = {
    low:     { title: "You're running less than usual", body: "Safe to increase your weekly mileage by 10–15% this week without injury risk.", color: "#0C447C", bg: "#E6F1FB", dot: "#378ADD" },
    optimal: { title: "Your training load is just right", body: "You're in the sweet spot. Keep this rhythm to build fitness safely.", color: "#27500A", bg: "#EAF3DE", dot: "#639922" },
    high:    { title: "You're pushing hard this week", body: "Consider an easy day or rest day to let your body recover and adapt.", color: "#791F1F", bg: "#FCEBEB", dot: "#E24B4A" },
  };

  const msg = statusMessages[zone];

  return (
    <div className="load-card">
      <div className="summary-card-title">Training load</div>

      {/* Zone pills */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>Where you are right now</div>
        <div style={{ display: "flex", gap: 6 }}>
          {zones.map(z => {
            const isActive = z.key === zone;
            return (
              <div
                key={z.key}
                style={{
                  flex: 1,
                  padding: "10px 8px",
                  borderRadius: 8,
                  background: isActive ? z.activeBg : "var(--bg-2)",
                  border: isActive ? `2px solid ${z.activeBorder}` : "1px solid var(--border)",
                  textAlign: "center",
                  transition: "all 0.2s",
                }}
              >
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: isActive ? z.activeTitle : "var(--text-muted)",
                }}>
                  {z.label}
                </div>
                <div style={{
                  fontSize: 11,
                  color: isActive ? z.activeSub : "var(--text-muted)",
                  marginTop: 2,
                }}>
                  {z.sub}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Load bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {/* This week */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>This week</span>
            <span style={{ color: "var(--text-muted)" }}>{training.acuteLoad} km</span>
          </div>
          <div className="load-bar-track">
            <div
              className="load-bar-fill acute"
              style={{ width: `${acuteWidth}%` }}
            />
          </div>
        </div>

        {/* Monthly average */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Monthly average</span>
            <span style={{ color: "var(--text-muted)" }}>{training.chronicLoad} km</span>
          </div>
          <div className="load-bar-track">
            <div
              className="load-bar-fill chronic"
              style={{ width: `${chronicWidth}%` }}
            />
          </div>
        </div>
      </div>

      {/* Plain English status */}
      <div style={{
        padding: "12px 14px",
        background: msg.bg,
        borderRadius: 8,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}>
        <div style={{
          width: 8, height: 8,
          borderRadius: "50%",
          background: msg.dot,
          marginTop: 4,
          flexShrink: 0,
        }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: msg.color, marginBottom: 2 }}>
            {msg.title}
          </div>
          <div style={{ fontSize: 12, color: msg.color, lineHeight: 1.5, opacity: 0.85 }}>
            {msg.body}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
function Home() {
  const [dashboard, setDashboard]   = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [training, setTraining]     = useState(null);
  const [efficiency, setEfficiency] = useState(null);
  const [loading, setLoading]       = useState(true);

  const fetchAll = async () => {
    try {
      const [dashRes, runsRes, loadRes, effRes] = await Promise.all([
        axios.get("https://running-orpin.vercel.app/api/analytics/dashboard"),
        axios.get("https://running-orpin.vercel.app/api/analytics/recent-runs?limit=30"),
        axios.get("https://running-orpin.vercel.app/api/analytics/training-load"),
        axios.get("https://running-orpin.vercel.app/api/analytics/efficiency"),
      ]);
      setDashboard(dashRes.data);
      setRecentRuns(runsRes.data);
      setTraining(loadRes.data);
      setEfficiency(effRes.data);
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    window.addEventListener("strava-synced", fetchAll);
    return () => window.removeEventListener("strava-synced", fetchAll);
  }, []);

  if (loading) {
    return (
      <div className="home-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading your runs...</p>
      </div>
    );
  }

  const weekRuns = getThisWeekRuns(recentRuns);
  const weekKm   = weekRuns.reduce((s, r) => s + parseFloat(r.distanceKm), 0).toFixed(1);

  return (
    <div className="home-page" style={{ paddingTop: 0 }}>



      {/* Main layout */}
      <div className="home-layout" style={{ alignItems: "flex-start" }}>

        {/* LEFT — This week's runs */}
        <div className="week-runs-panel">
          <div className="week-runs-header">
            <div className="week-runs-title">This Week</div>
            <div className="week-total-km">
              {weekKm}<span>km</span>
            </div>
          </div>

          <div className="run-cards-list">
            {weekRuns.length === 0 ? (
              <div className="no-runs-this-week">
                <strong>No runs this week yet</strong>
                Get out there — or sync Strava if you already did!
              </div>
            ) : (
              weekRuns.map((run, i) => (
                <div className="run-card" key={i}>
                  <div className="run-card-day">
                    <div className="run-card-day-name">{getDayName(run.date)}</div>
                    <div className="run-card-day-num">{getDayNum(run.date)}</div>
                  </div>
                  <div className="run-card-info">
                    <div className="run-card-name">{run.name}</div>
                    <div className="run-card-meta">
                      <span>⏱ {run.duration}</span>
                      {run.heartrate && <span>♥ {run.heartrate} bpm</span>}
                      {run.elevation > 0 && <span>↑ {run.elevation}m</span>}
                    </div>
                  </div>
                  <div className="run-card-stats">
                    <div className="run-card-distance">
                      {run.distanceKm}<span>km</span>
                    </div>
                    <div className="run-card-pace">{run.pace}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT — stat panels */}
        <div className="home-right" style={{ marginTop: 0, paddingTop: 0 }}>

          {/* All time summary */}
          <div className="summary-card" style={{ marginTop: 0 }}>
            <div className="summary-card-title">All Time</div>
            <div className="summary-stats">
              <div className="summary-stat">
                <div className="summary-stat-value accent">{dashboard?.totalKm || "—"}</div>
                <div className="summary-stat-label">km covered</div>
              </div>
              <div className="summary-stat">
                <div className="summary-stat-value">{dashboard?.totalRuns || "—"}</div>
                <div className="summary-stat-label">total runs</div>
              </div>
              <div className="summary-stat">
                <div className="summary-stat-value">{dashboard?.longestRunKm || "—"}</div>
                <div className="summary-stat-label">longest run km</div>
              </div>
              <div className="summary-stat">
                <div className="summary-stat-value">{dashboard?.avgPace || "—"}</div>
                <div className="summary-stat-label">avg pace</div>
              </div>
            </div>
          </div>

          {/* Running Efficiency — redesigned */}
          {efficiency && (
            <EfficiencyGauge score={efficiency.efficiencyScore} />
          )}

          {/* Training Load — redesigned */}
          {training && (
            <TrainingLoadCard training={training} />
          )}

        </div>
      </div>
    </div>
  );
}

export default Home;