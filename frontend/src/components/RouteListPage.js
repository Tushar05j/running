import { useEffect, useState } from "react";
import axios from "axios";
import "./RouteComparison.css";

function RouteListPage({ onSelectRoute }) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios
      .get("http://localhost:5000/api/routes")
      .then((res) => {
        setRoutes(res.data.routes);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load routes. Make sure GPS data exists.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rc-page">
        <div className="rc-header">
          <h1>Route Comparison</h1>
        </div>
        <div className="rc-loading">Loading your routes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rc-page">
        <div className="rc-header"><h1>Route Comparison</h1></div>
        <div className="rc-error">{error}</div>
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div className="rc-page">
        <div className="rc-header"><h1>Route Comparison</h1></div>
        <div className="rc-empty">
          <p>No repeated routes found yet.</p>
          <p>Run the same starting location at least twice and sync Strava to see comparisons.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rc-page">
      <div className="rc-header">
        <h1>Route Comparison</h1>
        <p className="rc-subtitle">
          {routes.length} repeated route{routes.length !== 1 ? "s" : ""} found — sorted by most runs
        </p>
      </div>

      <div className="rc-route-list">
        {routes.map((route, idx) => {
          const imp = route.improvementPct;
          const impPositive = imp > 0;
          const impLabel =
            imp > 0
              ? `▲ ${imp}% faster`
              : imp < 0
              ? `▼ ${Math.abs(imp)}% slower`
              : "No change";

          return (
            <button
              key={route.routeId}
              className="rc-route-card"
              onClick={() => onSelectRoute(route.routeId)}
            >
              {/* Rank badge */}
              <div className="rc-rank">#{idx + 1}</div>

              {/* Main info */}
              <div className="rc-route-main">
                <div className="rc-route-title">
                  Route {route.routeId}
                  <span className="rc-run-count">{route.totalRuns} runs</span>
                </div>
                <div className="rc-route-coords">
                  {route.centerLat}°, {route.centerLon}°
                </div>
                <div className="rc-route-dates">
                  {new Date(route.firstRunDate).toLocaleDateString("en-US", {
                    month: "short", year: "numeric"
                  })}
                  {" — "}
                  {new Date(route.lastRunDate).toLocaleDateString("en-US", {
                    month: "short", year: "numeric"
                  })}
                </div>
              </div>

              {/* Stats */}
              <div className="rc-route-stats">
                <div className="rc-stat">
                  <span className="rc-stat-label">Avg distance</span>
                  <span className="rc-stat-value">{route.avgDistanceKm} km</span>
                </div>
                <div className="rc-stat">
                  <span className="rc-stat-label">Avg pace</span>
                  <span className="rc-stat-value">{route.avgPace}/km</span>
                </div>
                <div className="rc-stat">
                  <span className="rc-stat-label">Best pace</span>
                  <span className="rc-stat-value">{route.bestPace}/km</span>
                </div>
                <div className="rc-stat">
                  <span className="rc-stat-label">Progress</span>
                  <span
                    className={`rc-stat-value ${
                      impPositive ? "rc-positive" : imp < 0 ? "rc-negative" : ""
                    }`}
                  >
                    {impLabel}
                  </span>
                </div>
              </div>

              {/* Data badges */}
              <div className="rc-badges">
                {route.hasHRData && (
                  <span className="rc-badge rc-badge-hr">
                    ♥ HR ({route.hrRunCount} runs)
                  </span>
                )}
                {route.hasCadenceData && (
                  <span className="rc-badge rc-badge-cadence">
                    ↻ Cadence ({route.cadenceRunCount} runs)
                  </span>
                )}
              </div>

              <div className="rc-arrow">→</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default RouteListPage;