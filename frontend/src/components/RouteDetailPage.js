import { useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import "./RouteComparison.css";

// ─── DECODE GOOGLE ENCODED POLYLINE ──────────────────────────────────────────
// Strava uses Google's encoded polyline format
function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, b;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; }
    while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; }
    while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

// ─── LEAFLET MAP COMPONENT ────────────────────────────────────────────────────
function RouteMap({ centerLat, centerLon, polyline }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    // Load Leaflet CSS dynamically
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS dynamically
    const loadLeaflet = () => {
      return new Promise((resolve) => {
        if (window.L) { resolve(window.L); return; }
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => resolve(window.L);
        document.head.appendChild(script);
      });
    };

    loadLeaflet().then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      // Init map centered on start point
      const map = L.map(mapRef.current).setView([centerLat, centerLon], 14);
      mapInstanceRef.current = map;

      // OpenStreetMap tiles — free, no API key
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      if (polyline) {
        // Decode and draw the full route path
        const coords = decodePolyline(polyline);
        if (coords.length > 0) {
          const routeLine = L.polyline(coords, {
            color: "#e86d2e",
            weight: 4,
            opacity: 0.85,
          }).addTo(map);

          // Fit map to route bounds
          map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });

          // Start marker (green)
          L.circleMarker(coords[0], {
            radius: 8, color: "#fff", fillColor: "#2e7d32",
            fillOpacity: 1, weight: 2,
          }).addTo(map).bindPopup("Start");

          // End marker (red)
          L.circleMarker(coords[coords.length - 1], {
            radius: 8, color: "#fff", fillColor: "#c0392b",
            fillOpacity: 1, weight: 2,
          }).addTo(map).bindPopup("Finish");
        }
      } else {
        // No polyline — just drop a pin on start point
        const icon = L.divIcon({
          html: `<div style="
            width:14px;height:14px;
            background:#e86d2e;
            border:2px solid #fff;
            border-radius:50%;
            box-shadow:0 1px 4px rgba(0,0,0,0.3)
          "></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
          className: "",
        });
        L.marker([centerLat, centerLon], { icon })
          .addTo(map)
          .bindPopup("Run start point");
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [centerLat, centerLon, polyline]);

  return (
    <div className="rc-map-wrapper">
      <div ref={mapRef} className="rc-map" />
      {!polyline && (
        <p className="rc-map-note">
          Showing start point only. Re-sync Strava to save full route paths.
        </p>
      )}
    </div>
  );
}

// ─── CUSTOM TOOLTIP ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rc-tooltip">
      <div className="rc-tooltip-label">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="rc-tooltip-row">
          <span className="rc-tooltip-dot" style={{ background: entry.color }} />
          <span>{entry.name}: </span>
          <strong>{entry.value != null ? entry.value : "—"}</strong>
          <span className="rc-tooltip-unit"> {entry.unit}</span>
        </div>
      ))}
    </div>
  );
}

function formatPaceAxis(value) {
  const min = Math.floor(value);
  const sec = Math.round((value - min) * 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function ChartSection({ title, subtitle, children }) {
  return (
    <div className="rc-chart-section">
      <div className="rc-chart-header">
        <h3>{title}</h3>
        {subtitle && <p className="rc-chart-subtitle">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function RouteDetailPage({ routeId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("pace");

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios
      .get(`https://running-orpin.vercel.app/api/routes/${routeId}`)
      .then((res) => { setData(res.data); setLoading(false); })
      .catch(() => { setError("Could not load route data."); setLoading(false); });
  }, [routeId]);

  if (loading) return (
    <div className="rc-page">
      <button className="rc-back-btn" onClick={onBack}>← Back to routes</button>
      <div className="rc-loading">Loading route data...</div>
    </div>
  );

  if (error) return (
    <div className="rc-page">
      <button className="rc-back-btn" onClick={onBack}>← Back to routes</button>
      <div className="rc-error">{error}</div>
    </div>
  );

  const { runs, summary } = data;
  const hasHR = runs.some((r) => r.heartrate !== null);
  const hasCadence = runs.some((r) => r.cadence !== null);

  const chartData = runs.map((r) => ({
    date: r.dateShort,
    fullDate: r.dateFormatted,
    name: r.name,
    pace: r.paceDecimal,
    paceFormatted: r.paceFormatted,
    distance: r.distanceKm,
    heartrate: r.heartrate,
    cadence: r.cadence,
    elevation: r.elevation,
  }));

  const tabs = [
    { key: "pace", label: "Pace" },
    { key: "distance", label: "Distance" },
    ...(hasHR ? [{ key: "heartrate", label: "Heart Rate" }] : []),
    ...(hasCadence ? [{ key: "cadence", label: "Cadence" }] : []),
    { key: "table", label: "All Runs" },
  ];

  return (
    <div className="rc-page">
      <button className="rc-back-btn" onClick={onBack}>← Back to routes</button>

      <div className="rc-detail-header">
        <div>
          <div className="home-greeting">
            Route {routeId} <span>Analysis.</span>
          </div>
          <div className="home-date">
            {data.totalRuns} runs · {data.centerLat}°, {data.centerLon}°
          </div>
        </div>
        <div className={`rc-trend-badge ${
          summary.paceSlope < -0.01 ? "rc-positive" : summary.paceSlope > 0.01 ? "rc-negative" : ""
        }`}>
          {summary.trend}
        </div>
      </div>

      {/* ── MAP ── */}
      <RouteMap
        centerLat={data.centerLat}
        centerLon={data.centerLon}
        polyline={data.representativePolyline}
      />

      {/* ── SUMMARY CARDS ── */}
      <div className="rc-summary-grid">
        <div className="rc-summary-card">
          <div className="rc-summary-label">Avg pace</div>
          <div className="rc-summary-value">{summary.avgPace}<span>/km</span></div>
        </div>
        <div className="rc-summary-card rc-summary-highlight">
          <div className="rc-summary-label">Best pace</div>
          <div className="rc-summary-value">{summary.bestPace}<span>/km</span></div>
        </div>
        <div className="rc-summary-card">
          <div className="rc-summary-label">Worst pace</div>
          <div className="rc-summary-value">{summary.worstPace}<span>/km</span></div>
        </div>
        <div className="rc-summary-card">
          <div className="rc-summary-label">Avg distance</div>
          <div className="rc-summary-value">{summary.avgDistanceKm}<span>km</span></div>
        </div>
        {summary.avgHR && (
          <div className="rc-summary-card">
            <div className="rc-summary-label">Avg heart rate</div>
            <div className="rc-summary-value">{summary.avgHR}<span>bpm</span></div>
          </div>
        )}
        {summary.avgCadence && (
          <div className="rc-summary-card">
            <div className="rc-summary-label">Avg cadence</div>
            <div className="rc-summary-value">{summary.avgCadence}<span>spm</span></div>
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div className="rc-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`rc-tab ${activeTab === tab.key ? "rc-tab-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "pace" && (
        <>
          <ChartSection title="Pace over time" subtitle="Lower = faster.">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} />
                <YAxis tickFormatter={formatPaceAxis} tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const run = runs.find((r) => r.dateShort === label);
                  return (
                    <div className="rc-tooltip">
                      <div className="rc-tooltip-label">{payload[0]?.payload?.fullDate}</div>
                      <div className="rc-tooltip-name">{run?.name}</div>
                      <div className="rc-tooltip-row">
                        <span className="rc-tooltip-dot" style={{ background: "#e86d2e" }} />
                        Pace: <strong>{run?.paceFormatted}/km</strong>
                      </div>
                    </div>
                  );
                }} />
                <Line type="monotone" dataKey="pace" stroke="#e86d2e" strokeWidth={2.5} dot={{ r: 5, fill: "#e86d2e", strokeWidth: 0 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>

          {hasHR && (
            <ChartSection title="Pace vs Heart Rate" subtitle="Same pace + lower HR = you're getting fitter.">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 10, right: 50, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} />
                  <YAxis yAxisId="pace" tickFormatter={formatPaceAxis} tick={{ fontSize: 11, fill: "#e86d2e" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <YAxis yAxisId="hr" orientation="right" tick={{ fontSize: 11, fill: "#e84e4e" }} tickLine={false} axisLine={false} unit=" bpm" domain={["auto", "auto"]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="pace" type="monotone" dataKey="pace" stroke="#e86d2e" strokeWidth={2} dot={{ r: 4, strokeWidth: 0 }} name="Pace" unit="/km" />
                  <Line yAxisId="hr" type="monotone" dataKey="heartrate" stroke="#e84e4e" strokeWidth={2} dot={{ r: 4, strokeWidth: 0 }} connectNulls={false} name="Heart rate" unit=" bpm" />
                </LineChart>
              </ResponsiveContainer>
            </ChartSection>
          )}
        </>
      )}

      {activeTab === "distance" && (
        <ChartSection title="Distance per run">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} unit=" km" />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const run = runs.find((r) => r.dateShort === label);
                return (
                  <div className="rc-tooltip">
                    <div className="rc-tooltip-label">{payload[0]?.payload?.fullDate}</div>
                    <div className="rc-tooltip-name">{run?.name}</div>
                    <div className="rc-tooltip-row">
                      <span className="rc-tooltip-dot" style={{ background: "#4c9be8" }} />
                      Distance: <strong>{payload[0].value} km</strong>
                    </div>
                  </div>
                );
              }} />
              <Bar dataKey="distance" fill="#4c9be8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {activeTab === "heartrate" && hasHR && (
        <ChartSection title="Heart rate over time" subtitle="If pace stays similar but HR drops, your fitness is improving.">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} unit=" bpm" domain={["auto", "auto"]} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const run = runs.find((r) => r.dateShort === label);
                return (
                  <div className="rc-tooltip">
                    <div className="rc-tooltip-label">{payload[0]?.payload?.fullDate}</div>
                    <div className="rc-tooltip-name">{run?.name}</div>
                    {payload[0].value != null
                      ? <div className="rc-tooltip-row"><span className="rc-tooltip-dot" style={{ background: "#e84e4e" }} />HR: <strong>{payload[0].value} bpm</strong></div>
                      : <div className="rc-tooltip-row rc-no-data">No HR data</div>}
                  </div>
                );
              }} />
              {summary.avgHR && <ReferenceLine y={summary.avgHR} stroke="#ccc" strokeDasharray="5 5" label={{ value: "avg", position: "right", fontSize: 10, fill: "#999" }} />}
              <Line type="monotone" dataKey="heartrate" stroke="#e84e4e" strokeWidth={2.5} dot={{ r: 5, fill: "#e84e4e", strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {activeTab === "cadence" && hasCadence && (
        <ChartSection title="Cadence over time" subtitle="Higher cadence generally means better running form.">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} unit=" spm" domain={["auto", "auto"]} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const run = runs.find((r) => r.dateShort === label);
                return (
                  <div className="rc-tooltip">
                    <div className="rc-tooltip-label">{payload[0]?.payload?.fullDate}</div>
                    <div className="rc-tooltip-name">{run?.name}</div>
                    {payload[0].value != null
                      ? <div className="rc-tooltip-row"><span className="rc-tooltip-dot" style={{ background: "#38a169" }} />Cadence: <strong>{payload[0].value} spm</strong></div>
                      : <div className="rc-tooltip-row rc-no-data">No cadence data</div>}
                  </div>
                );
              }} />
              {summary.avgCadence && <ReferenceLine y={parseFloat(summary.avgCadence)} stroke="#ccc" strokeDasharray="5 5" label={{ value: "avg", position: "right", fontSize: 10, fill: "#999" }} />}
              <Line type="monotone" dataKey="cadence" stroke="#38a169" strokeWidth={2.5} dot={{ r: 5, fill: "#38a169", strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {activeTab === "table" && (
        <ChartSection title="All runs on this route">
          <table className="rc-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Name</th>
                <th>Distance</th>
                <th>Pace</th>
                <th>Duration</th>
                {hasHR && <th>HR</th>}
                {hasCadence && <th>Cadence</th>}
                {runs.some(r => r.elevation) && <th>Elevation</th>}
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr key={i}>
                  <td className="rc-table-num">{i + 1}</td>
                  <td>{run.dateFormatted}</td>
                  <td>{run.name}</td>
                  <td>{run.distanceKm} km</td>
                  <td className={run.paceDecimal === Math.min(...runs.map(r => r.paceDecimal)) ? "rc-best" : ""}>{run.paceFormatted}/km</td>
                  <td>{run.duration}</td>
                  {hasHR && <td>{run.heartrate ? `${run.heartrate} bpm` : "—"}</td>}
                  {hasCadence && <td>{run.cadence ? `${run.cadence} spm` : "—"}</td>}
                  {runs.some(r => r.elevation) && <td>{run.elevation ? `+${run.elevation}m` : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </ChartSection>
      )}
    </div>
  );
}

export default RouteDetailPage;